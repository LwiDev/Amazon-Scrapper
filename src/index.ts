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
        // Configuration spécifique pour Render sans dépendances système
        browser = await playwright.chromium.launch({
            headless: true,
            chromiumSandbox: false,
            args: [
                '--disable-dev-shm-usage',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-gpu',
                '--no-zygote',
                '--single-process',
                '--disable-extensions'
            ]
        });

        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            viewport: { width: 1920, height: 1080 },
            ignoreHTTPSErrors: true,
            javaScriptEnabled: true
        });

        const page = await context.newPage();

        // Gestion optimisée des ressources
        await page.route('**/*', async route => {
            const request = route.request();
            const resourceType = request.resourceType();
            const shouldBlock = ['image', 'stylesheet', 'font', 'media'].includes(resourceType);

            if (shouldBlock) {
                await route.abort();
            } else {
                await route.continue();
            }
        });

        // Timeout plus long pour la navigation
        await page.goto(url, {
            waitUntil: 'networkidle',
            timeout: 60000
        });

        // Attendre que le contenu soit chargé
        await page.waitForLoadState('domcontentloaded');

        const data = await page.evaluate(() => {
            const title = document.querySelector('#productTitle')?.textContent?.trim() || '';

            const priceSelectors = [
                '#priceblock_ourprice',
                '.a-price .a-offscreen',
                '#price_inside_buybox',
                '.a-price-whole',
                '#corePrice_feature_div .a-offscreen',
                '#price'
            ];

            let price = '';
            for (const selector of priceSelectors) {
                const element = document.querySelector(selector);
                if (element) {
                    price = element.textContent?.trim() || '';
                    break;
                }
            }

            // Collecte des images
            const photos: string[] = [];
            const mainImage = document.querySelector('#landingImage') as HTMLImageElement;
            if (mainImage?.src) {
                photos.push(mainImage.src);
            }

            // Images alternatives
            const altImages = document.querySelectorAll('#altImages img');
            altImages.forEach((img: Element) => {
                const src = (img as HTMLImageElement).src;
                if (src && !src.includes('sprite')) {
                    photos.push(src.replace(/\._.*_\./, '.'));
                }
            });

            return {
                title,
                price,
                photos: [...new Set(photos)], // Éliminer les doublons
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
            error: error instanceof Error ? error.message : 'Erreur inconnue'
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