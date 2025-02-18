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
    image: string;
    url: string;
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
        browser = await playwright.chromium.launch({
            headless: true
        });

        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        });

        const page = await context.newPage();

        await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        const data = await page.evaluate(() => {
            const title = document.querySelector('#productTitle')?.textContent?.trim() || '';

            const priceSelectors = [
                '#priceblock_ourprice',
                '.a-price .a-offscreen',
                '#price_inside_buybox',
                '.a-price-whole'
            ];

            let price = '';
            for (const selector of priceSelectors) {
                const element = document.querySelector(selector);
                if (element) {
                    price = element.textContent?.trim() || '';
                    break;
                }
            }

            const imageElement = document.querySelector('#landingImage') as HTMLImageElement;
            const image = imageElement?.src || '';

            return {
                title,
                price,
                image,
                url: window.location.href
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
        if (browser) await browser.close();
    }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Service en cours d'exécution sur le port ${port}`);
});