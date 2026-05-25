import 'dotenv/config';
import wolfjs from 'wolf.js';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';

const { WOLF } = wolfjs;
const client = new WOLF();

const TARGET_USER_ID = 51660277;
const CHANNEL_ID = 81889058;

client.on('ready', async () => {
    console.log("🚀 البوت متصل ومفعل في القناة " + CHANNEL_ID);
    await client.group.joinById(CHANNEL_ID);
});

client.on('groupMessage', async (message) => {
    // 1. فحص الهوية (للتأكد أن البوت يرى الرسالة)
    if (message.targetGroupId != CHANNEL_ID) return;
    
    // طباعة أي رسالة تأتي من المستخدم المستهدف (سواء نص أو صورة)
    if (message.sourceSubscriberId == TARGET_USER_ID) {
        console.log(`📩 رسالة من المستخدم المستهدف. النوع: ${message.type}`);

        // إذا كانت صورة
        if (message.type === 'text/image_link') {
            const imageUrl = message.body;
            console.log("🖼️ تم اكتشاف رابط صورة: " + imageUrl);

            try {
                // محاولة المعالجة
                const response = await fetch(imageUrl);
                const buffer = Buffer.from(await response.arrayBuffer());
                
                console.log("🔍 جاري فحص محتوى الصورة...");
                
                // فحص هل هي كابتشا
                const isCaptcha = await checkCaptchaContent(buffer);
                
                if (isCaptcha) {
                    console.log("✅ الصورة كابتشا! جاري الحل...");
                    const code = await solveCaptcha(buffer);
                    console.log("🔑 الحل المستخرج: " + code);
                    await client.messaging.sendGroupMessage(CHANNEL_ID, `#${code}`);
                } else {
                    console.log("⏭️ تم تجاهل الصورة لأنها لا تحتوي على نص 'اختبار' أو 'تحقق'");
                }
            } catch (err) {
                console.error("❌ خطأ أثناء المعالجة: " + err.message);
            }
        }
    }
});

async function checkCaptchaContent(buffer) {
    try {
        const header = await sharp(buffer)
            .extract({ left: 0, top: 0, width: 800, height: 300 })
            .greyscale()
            .threshold(128)
            .toBuffer();

        const worker = await createWorker('ara');
        const { data: { text } } = await worker.recognize(header);
        await worker.terminate();

        console.log("📝 النص المقروء من الصورة: [" + text.trim() + "]");

        const cleanText = text.replace(/\s/g, '');
        return cleanText.includes('اختبار') || cleanText.includes('تحقق');
    } catch (e) {
        console.error("⚠️ خطأ في قراءة النص: " + e.message);
        return false;
    }
}

// دالة الحل التي كانت تعمل معك سابقاً
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
    if (!found) throw new Error("لم يتم العثور على الإطار الأصفر");

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
