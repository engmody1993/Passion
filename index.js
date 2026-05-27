import 'dotenv/config';
import wolfjs from 'wolf.js';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';

const { WOLF } = wolfjs;
const client = new WOLF();

// --- الإعدادات ---
const CHANNEL_ID = 81889058;    // القناة المستهدفة
const BOT_ID = 51660277;        // عضوية البوت (لمنع التفاعل مع رسائل البوت نفسه)
const INTERVAL_MS = 63000;      // وقت المهام التلقائية

client.on('ready', async () => {
    console.log(`🚀 البوت متصل ومستعد!`);
    console.log(`📡 يراقب القناة: ${CHANNEL_ID}`);
    await client.group.joinById(CHANNEL_ID);
    startAutomation();
});

// دالة المهام التلقائية
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

// 1. دالة فحص اللون (للتأكد أنها كابتشا) - تعتمد على كثافة اللون الأحمر
async function isCaptchaByColor(buffer) {
    const { data, info } = await sharp(buffer).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
    let redPixels = 0;
    const totalPixels = info.width * info.height;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 120 && data[i] > (data[i + 1] + 30) && data[i] > (data[i + 2] + 30)) redPixels++;
    }
    const percentage = (redPixels / totalPixels) * 100;
    return percentage > 40;
}

// 2. دالة استخراج اسم اللاعب (مع الإحداثيات المصححة)
async function extractPlayerName(buffer) {
    try {
        const metadata = await sharp(buffer).metadata();
        const { width, height } = metadata;
        
        // الإحداثيات المصححة للتركيز على سطر اسم اللاعب فقط
        const extractOptions = {
            left: Math.floor(width * 0.70),
            top: Math.floor(height * 0.05),
            width: Math.floor(width * 0.25),
            height: Math.floor(height * 0.03)
        };

        const croppedBuffer = await sharp(buffer)
            .extract(extractOptions)
            .greyscale()
            .threshold(180)
            .toBuffer();

        const worker = await createWorker('ara+eng');
        const { data: { text } } = await worker.recognize(croppedBuffer);
        await worker.terminate();

        // تنظيف النص
        return text.replace(/[^a-zA-Z0-9\u0621-\u064A]/g, ' ').trim() || "غير معروف";
    } catch (e) {
        return "خطأ في القراءة";
    }
}

// 3. دالة حل الكابتشا (تعتمد على الإطار الأصفر)
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

// الاستماع للرسائل
client.on('groupMessage', async (message) => {
    // 1. الفلاتر الأساسية: القناة، المرسل، والنوع
    if (message.targetGroupId != CHANNEL_ID) return;
    if (message.sourceSubscriberId == BOT_ID) return; // منع التفاعل مع رسائل البوت نفسه
    if (message.type !== 'text/image_link') return;

    const imageUrl = message.body;
    
    try {
        const response = await fetch(imageUrl);
        const buffer = Buffer.from(await response.arrayBuffer());

        // 2. التحقق من أنها كابتشا (باللون)
        const isCaptcha = await isCaptchaByColor(buffer);
        if (!isCaptcha) return;

        // 3. استخراج الاسم وطباعته
        const playerName = await extractPlayerName(buffer);
        console.log(`👤 اسم اللاعب في البطاقة: ${playerName}`);
        
        // 4. حل الكابتشا وإرسالها
        const code = await solveCaptcha(buffer);
        if (code) {
            await client.messaging.sendGroupMessage(CHANNEL_ID, `#${code}`);
            console.log(`✅ تم إرسال الرمز: #${code}`);
        }
    } catch (err) {
        console.error("⚠️ خطأ في المعالجة:", err.message);
    }
});

client.login(process.env.U_MAIL, process.env.U_PASS);
