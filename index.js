import 'dotenv/config';
import wolfjs from 'wolf.js';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import fetch from 'node-fetch';

const { WOLF } = wolfjs;
const client = new WOLF();

// ========================================
// الإعدادات
// ========================================

const TARGET_USER_ID = 84520028;
const CHANNEL_ID = 569;

const TARGET_PLAYER_NAME = 'SAA';

// ========================================
// التوقيتات
// ========================================

// كل دقيقة
const TASKS_DELAY = 60000;

// كل 3 دقائق
const BOX_DELAY = 180000;

let lastSolved = '';
let solving = false;

// ========================================
// OCR WORKER
// ========================================

const worker = await createWorker('eng+ara');

await worker.setParameters({
    tessedit_pageseg_mode: '7',
    preserve_interword_spaces: '0',
});

// ========================================
// READY
// ========================================

client.on('ready', async () => {

    console.log(`🚀 البوت متصل`);
    console.log(`🎯 فلترة الاسم: ${TARGET_PLAYER_NAME}`);

    try {

        await client.group.joinById(CHANNEL_ID);

        console.log(`✅ دخل القناة`);

        startAutomation();

    } catch (err) {

        console.error('❌ خطأ بالدخول:', err.message);

    }

});

// ========================================
// AUTOMATION
// ========================================

function startAutomation() {

    // ========================================
    // !مد مهام + !مد تحالف ايداع كل
    // كل دقيقة
    // ========================================

    const runMinuteCommands = async () => {

        try {

            // ========================================
            // !مد مهام
            // ========================================

            await client.messaging.sendGroupMessage(
                CHANNEL_ID,
                '!مد مهام'
            );

            console.log('✅ تم إرسال !مد مهام');

            // ========================================
            // انتظار 3 ثواني
            // ========================================

            await wait(3000);

            // ========================================
            // !مد تحالف ايداع كل
            // ========================================

            await client.messaging.sendGroupMessage(
                CHANNEL_ID,
                '!مد تحالف ايداع كل'
            );

            console.log('✅ تم إرسال !مد تحالف ايداع كل');

        } catch (err) {

            console.error('❌ خطأ بأوامر الدقيقة:', err.message);

        }
    };

    // ========================================
    // !مد صندوق فتح
    // كل 3 دقائق
    // ========================================

    const runBoxCommand = async () => {

        try {

            await client.messaging.sendGroupMessage(
                CHANNEL_ID,
                '!مد صندوق فتح'
            );

            console.log('✅ تم إرسال !مد صندوق فتح');

        } catch (err) {

            console.error('❌ خطأ بأمر الصندوق:', err.message);

        }
    };

    // تشغيل مباشر أول مرة
    runMinuteCommands();
    runBoxCommand();

    // التكرار
    setInterval(runMinuteCommands, TASKS_DELAY);

    setInterval(runBoxCommand, BOX_DELAY);
}

// ========================================
// EVENTS
// ========================================

client.on('groupMessage', async (message) => {

    try {

        // ========================================
        // فلترة الرسائل
        // ========================================

        if (message.targetGroupId != CHANNEL_ID) return;

        if (message.sourceSubscriberId != TARGET_USER_ID) return;

        if (message.type !== 'text/image_link') return;

        if (solving) return;

        solving = true;

        const imageUrl = message.body;

        console.log('🖼️ تم استلام صورة');

        // ========================================
        // تحميل الصورة
        // ========================================

        const response = await fetch(imageUrl);

        const buffer = Buffer.from(await response.arrayBuffer());

        // ========================================
        // فحص الكابتشا
        // ========================================

        const isCaptcha = await isCaptchaByColor(buffer);

        if (!isCaptcha) {

            solving = false;
            return;

        }

        console.log('✅ تم اكتشاف كابتشا');

        // ========================================
        // استخراج اسم اللاعب
        // ========================================

        const playerName = await extractPlayerName(buffer);

        console.log(`👤 اللاعب: ${playerName}`);

        // ========================================
        // فلترة الاسم
        // ========================================

        if (
            !playerName
                .toLowerCase()
                .includes(TARGET_PLAYER_NAME.toLowerCase())
        ) {

            console.log('⏭️ الاسم غير مطابق');

            solving = false;
            return;
        }

        console.log('✅ الاسم مطابق');

        // ========================================
        // حل الكابتشا
        // ========================================

        const code = await solveCaptcha(buffer);

        if (!code) {

            console.log('❌ فشل استخراج الكود');

            solving = false;
            return;
        }

        // ========================================
        // منع التكرار
        // ========================================

        if (code === lastSolved) {

            console.log('⏭️ تم تجاهل كود مكرر');

            solving = false;
            return;
        }

        lastSolved = code;

        // ========================================
        // إرسال الحل
        // ========================================

        await client.messaging.sendGroupMessage(
            CHANNEL_ID,
            `#${code}`
        );

        console.log(`✅ تم إرسال الحل: #${code}`);

        // ========================================
        // إعادة السماح بعد ثواني
        // ========================================

        setTimeout(() => {

            lastSolved = '';

        }, 15000);

    } catch (err) {

        console.error('⚠️ خطأ:', err.message);

    }

    solving = false;

});

// ========================================
// كشف صورة التحقق
// ========================================

async function isCaptchaByColor(buffer) {

    const {
        data,
        info
    } = await sharp(buffer)
        .raw()
        .ensureAlpha()
        .toBuffer({ resolveWithObject: true });

    let yellowPixels = 0;

    const totalPixels = info.width * info.height;

    for (let i = 0; i < data.length; i += 4) {

        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        if (
            r > 170 &&
            g > 170 &&
            b < 140
        ) {

            yellowPixels++;

        }
    }

    const percentage =
        (yellowPixels / totalPixels) * 100;

    return percentage > 1.2;
}

// ========================================
// استخراج اسم اللاعب
// ========================================

async function extractPlayerName(buffer) {

    try {

        const processed = await sharp(buffer)

            .greyscale()

            .normalize()

            .resize({ width: 1400 })

            .sharpen()

            .threshold(150)

            .toBuffer();

        const {
            data: { text }
        } = await worker.recognize(processed);

        const clean = text
            .replace(/\s+/g, ' ')
            .trim();

        console.log('📄 OCR TEXT:', clean);

        const match = clean.match(
            /اللاعب[:\s]+([^\n\r]+)/u
        );

        if (!match) return '';

        return match[1]
            .replace(/[^\u0621-\u064Aa-zA-Z0-9_ ]/g, '')
            .trim();

    } catch (err) {

        console.log('❌ خطأ قراءة الاسم');

        return '';

    }
}

// ========================================
// حل الكابتشا
// ========================================

async function solveCaptcha(buffer) {

    const {
        data,
        info
    } = await sharp(buffer)
        .raw()
        .ensureAlpha()
        .toBuffer({ resolveWithObject: true });

    let minX = info.width;
    let minY = info.height;
    let maxX = 0;
    let maxY = 0;

    let found = false;

    // ========================================
    // اكتشاف الإطار الأصفر
    // ========================================

    for (let y = 0; y < info.height; y++) {

        for (let x = 0; x < info.width; x++) {

            const idx = (y * info.width + x) * 4;

            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];

            if (
                r > 180 &&
                g > 180 &&
                b < 120
            ) {

                minX = Math.min(minX, x);
                minY = Math.min(minY, y);

                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);

                found = true;
            }
        }
    }

    if (!found) {

        console.log('❌ لم يتم اكتشاف الإطار');

        return null;
    }

    // ========================================
    // قص المنطقة
    // ========================================

    const margin = 15;

    const width = maxX - minX - margin * 2;
    const height = maxY - minY - margin * 2;

    if (width <= 0 || height <= 0) {

        console.log('❌ أبعاد غير صالحة');

        return null;
    }

    // ========================================
    // تحسين الصورة
    // ========================================

    const processed = await sharp(buffer)

        .extract({
            left: minX + margin,
            top: minY + margin,
            width,
            height
        })

        .resize({
            width: width * 4
        })

        .greyscale()

        .normalize()

        .modulate({
            brightness: 1.2
        })

        .sharpen()

        .threshold(145)

        .png()

        .toBuffer();

    // ========================================
    // OCR
    // ========================================

    const {
        data: { text }
    } = await worker.recognize(processed);

    console.log('🔍 النص الخام:', text);

    // ========================================
    // تنظيف الناتج
    // ========================================

    let result = text

        .replace(/\s/g, '')

        .replace(/[^a-zA-Z0-9\u0621-\u064A]/g, '')

        .trim();

    // ========================================
    // تحسينات شائعة
    // ========================================

    result = result

        .replace(/O/g, '0')
        .replace(/I/g, '1')
        .replace(/l/g, '1');

    if (result.length < 2) {

        return null;
    }

    return result;
}

// ========================================
// أدوات مساعدة
// ========================================

function wait(ms) {

    return new Promise(resolve => {

        setTimeout(resolve, ms);

    });
}

// ========================================
// LOGIN
// ========================================

client.login(
    process.env.U_MAIL,
    process.env.U_PASS
);
