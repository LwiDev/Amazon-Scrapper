import express from 'express';
import playwright from 'playwright';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

interface ProductData {
    title: string;
    price: string;
    photos: string[];
    product_url: string;
}

app.get('/', (_, res) => {
    res.send('Service de scraping Amazon actif');
});

app.post('/scrape', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL requise' });
    }

    let browser = null;

    try {
        // Configuration spécifique pour Render
        browser = await playwright.chromium.launch({
            headless: true,
            args: [
                '--disable-dev-shm-usage',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-gpu'
            ]
        });

        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            viewport: { width: 1920, height: 1080 },
            extraHTTPHeaders: {
                'Accept-Language': 'fr-FR,fr;q=0.9',
                'Referer': 'https://www.amazon.ca/',
                'Upgrade-Insecure-Requests': '1'
            }
        });

        const page = await context.newPage();

        // Intercepter et bloquer les ressources non nécessaires
        await page.route('**/*', (route) => {
            const resourceType = route.request().resourceType();
            if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                route.abort();
            } else {
                route.continue();
            }
        });

        await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        // Attendre que les éléments clés soient chargés
        await page.waitForSelector('#productTitle', { timeout: 5000 }).catch(() => null);
        console.log(await page.content());

        const data = await page.evaluate(() => {
            const title = document.querySelector('#productTitle')?.textContent?.trim() || '';

            const priceSelectors = [
                '#priceblock_ourprice',
                '.a-price .a-offscreen',
                '#price_inside_buybox',
                '.a-price-whole',
                '#corePrice_feature_div .a-offscreen'
            ];

            let price = '';
            for (const selector of priceSelectors) {
                const element = document.querySelector(selector);
                if (element) {
                    price = element.textContent?.trim() || '';
                    break;
                }
            }

            // Récupération des images
            const photos: string[] = [];
            const imageElements = document.querySelectorAll('#altImages img');
            imageElements.forEach((img: Element) => {
                const src = (img as HTMLImageElement).src;
                if (src && !src.includes('sprite')) {
                    const highResSrc = src.replace(/\._.*_\./, '.');
                    photos.push(highResSrc);
                }
            });

            // Si pas d'images dans altImages, essayer l'image principale
            if (photos.length === 0) {
                const mainImage = document.querySelector('#landingImage') as HTMLImageElement;
                if (mainImage?.src) {
                    photos.push(mainImage.src);
                }
            }

            return {
                title,
                price,
                photos,
                product_url: window.location.href
            } as ProductData;
        });

        if (!data.title) {
            throw new Error('Impossible de trouver les informations du produit');
        }

        res.json({ data });
    } catch (error) {
        console.error('Erreur:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Erreur inconnue',
            stack: error instanceof Error ? error.stack : null
        });
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch (error) {
                console.error('Erreur lors de la fermeture du navigateur:', error);
            }
        }
    }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Service en cours d'exécution sur le port ${port}`);
});