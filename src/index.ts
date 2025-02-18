import express from 'express';
import puppeteer from 'puppeteer-core';
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

// Fonction pour détecter le chemin de Chrome selon la plateforme
const getChromePath = () => {
    switch (process.platform) {
        case 'win32':
            return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
        case 'darwin':
            return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
        default:
            return '/usr/bin/google-chrome';
    }
};

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
        browser = await puppeteer.launch({
            headless: "new",
            executablePath: getChromePath(),
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage'
            ]
        });

        const page = await browser.newPage();

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

        await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

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

            const photos: string[] = [];
            const mainImage = document.querySelector('#landingImage') as HTMLImageElement;
            if (mainImage?.src) {
                photos.push(mainImage.src);
            }

            return {
                title,
                price,
                photos,
                product_url: window.location.href
            };
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