import 'dotenv/config';
import wolfjs from 'wolf.js';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';

const { WOLF } = wolfjs;
const client = new WOLF();

const CHANNEL_ID = 81889058;
const BOT_ID = 51660277; // ضع ID الخاص بالبوت هنا لتجنب التكرار
const INTERVAL_MS = 63000;

client.on('ready', async () => {
    console.log("🚀 البوت متصل! جاهز للفلترة باسم اللاعب.");
    await client.group.joinById(CHANNEL_ID);
    startAutomation();
});

async function startAutomation() {
    setInterval(async () => {
        try {
            await client.messaging.sendGroupMessage(CHANNEL_ID, '!مد مهام');
            await new Promise(resolve => setTimeout(resolve, 2000));
            await client.messaging.sendGroupMessage(CHANNEL_ID, '!مد تحالف ايداع كل');
        } catch (err) {
            console.error("❌ خطأ في الأتمتة:", err.message);
        }
    }, INTERVAL_MS);
}

// 1. فحص اللون (التحقق البشري > 50%)
async function isCaptchaByColor(buffer) {
    const { data, info } = await sharp(buffer).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
    let redPixels = 0;
    const totalPixels = info.width * info.height;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 120 && data[i] > (data[i + 1] + 30) && data[i] > (data[i + 2] + 30)) redPixels++;
    }
    const percentage = (redPixels / totalPixels) * 100;
    return percentage > 50; 
}

// 2. استخراج اسم اللاعب
async function getPlayerName(buffer) {
    try {
        const metadata = await sharp(buffer).metadata();
        const { width, height } = metadata;
        
        // اقتصاص الجزء العلوي حيث يوجد الاسم
        const crop = await sharp(buffer)
            .extract({ left: Math.floor(width * 0.70), top: Math.floor(height * 0.05), width: Math.floor(width * 0.25), height: Math.floor(height * 0.05) })
            .greyscale()
            .threshold(160)
            .toBuffer();

        const worker = await createWorker('ara+eng');
        const { data: { text } } = await worker.recognize(crop);
        await worker.terminate();

        // البحث عن الاسم بعد كلمة "اللاعب"
        const match = text.match(/اللاعب[:\s]+([^\n\r]+)/u);
        return match ? match[1].trim() : "";
    } catch (e) {
        return "";
    }
}

client.on('groupMessage', async (message) => {
    if (message.targetGroupId != CHANNEL_ID || message.sourceSubscriberId == BOT_ID) return;
    if (message.type !== 'text/image_link') return;

    const imageUrl = message.body;
    
    try {
        const response = await fetch(imageUrl);
        const buffer = Buffer.from(await response.arrayBuffer());

        // 1. فحص نسبة اللون الأحمر (> 50%)
        if (!(await isCaptchaByColor(buffer))) return;

        // 2. فحص اسم اللاعب
        const playerName = await getPlayerName(buffer);
        console.log(`👤 تم فحص بطاقة، اللاعب هو: "${playerName}"`);

        // التحقق من اسم "king" (بشكل غير حساس لحالة الأحرف)
        if (!playerName.toLowerCase().includes('ksa')) {
            console.log("⏭️ تم تجاهل البطاقة (الاسم ليس king).");
            return;
        }

        console.log("✅ الاسم يطابق، جاري الحل...");

        // 3. حل الكابتشا
        const code = await solveCaptcha(buffer);
        if (code) {
            await client.messaging.sendGroupMessage(CHANNEL_ID, `#${code}`);
            console.log(`✅ تم إرسال الحل: #${code}`);
        }
    } catch (err) {
        console.error("⚠️ خطأ:", err.message);
    }
});

async function solveCaptcha(buffer) {
    const { data, info } = await sharp(buffer).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
    let minX = info.width, minY = info.height, maxX = 0, maxY = 0, found = false;

    for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
            const idx = (y * info.width + x) * 4;
            if (data[idx] > 200 && data[idx + 1] > 200 && data[idx + 2] < 100) {
                minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
                found = true;
            }
        }
    }
    if (!found) return null;

    const margin = 10;
    const processedBuffer = await sharp(buffer)
        .extract({ left: minX + margin, top: minY + margin, width: (maxX - minX) - (margin * 2), height: (maxY - minY) - (margin * 2) })
        .greyscale()
        .normalize()
        .linear(1.5, -0.2)
        .sharpen()
        .toBuffer();

    const worker = await createWorker('eng+ara');
    await worker.setParameters({ tessedit_pageseg_mode: '7' });
    const { data: { text } } = await worker.recognize(processedBuffer);
    await worker.terminate();

    return text.replace(/[^a-zA-Z0-9\u0621-\u064A]/g, '').trim();
}

client.login(process.env.U_MAIL, process.env.U_PASS);
