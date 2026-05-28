import 'dotenv/config';
import wolfjs from 'wolf.js';
import sharp from 'sharp';
import fetch from 'node-fetch';
import { createWorker } from 'tesseract.js';

const { WOLF } = wolfjs;
const client = new WOLF();

// ========================================
// الإعدادات
// ========================================

const TARGET_USER_ID = 84520028; // مرسل صور الكابتشا
const CHANNEL_ID = 569; // آيدي القناة

const DELAY_MS = 63000; // المهام الرئيسية
const BOX_DELAY_MS = 180000; // الصندوق كل 3 دقائق

const TARGET_PLAYER_NAME = 'King';

// ========================================
// تشغيل البوت
// ========================================

client.on('ready', async () => {

    console.log(`🚀 البوت متصل`);
    console.log(
        `🎯 سيتم الحل فقط إذا كان الاسم يحتوي على: ${TARGET_PLAYER_NAME}`
    );

    await client.group.joinById(CHANNEL_ID);

    startAutomation();
});

// ========================================
// الأوامر التلقائية
// ========================================

async function startAutomation() {

    // ====================================
    // المهام + الإيداع
    // ====================================

    const runMainTask = async () => {

        try {

            await sleep(3000);

            // أمر المهام
            await client.messaging.sendGroupMessage(
                CHANNEL_ID,
                '!مد مهام'
            );

            console.log('✅ تم إرسال !مد مهام');

            await sleep(2000);

            // أمر الإيداع
            await client.messaging.sendGroupMessage(
                CHANNEL_ID,
                '!مد تحالف ايداع كل'
            );

            console.log(
                '✅ تم إرسال !مد تحالف ايداع كل'
            );

        } catch (err) {

            console.error(
                '❌ خطأ في المهام:',
                err.message
            );

        }

        setTimeout(
            runMainTask,
            DELAY_MS
        );
    };

    // ====================================
    // فتح الصندوق كل 3 دقائق
    // ====================================

    const runBoxTask = async () => {

        try {

            await client.messaging.sendGroupMessage(
                CHANNEL_ID,
                '!مد صندوق فتح'
            );

            console.log(
                '📦 تم إرسال !مد صندوق فتح'
            );

        } catch (err) {

            console.error(
                '❌ خطأ في الصندوق:',
                err.message
            );

        }

        setTimeout(
            runBoxTask,
            BOX_DELAY_MS
        );
    };

    // تشغيل المهمتين
    runMainTask();
    runBoxTask();
}

// ========================================
// التقاط الرسائل
// ========================================

client.on('groupMessage', async (message) => {

    try {

        // فلترة القناة
        if (message.targetGroupId != CHANNEL_ID)
            return;

        // فلترة المرسل
        if (
            message.sourceSubscriberId !=
            TARGET_USER_ID
        )
            return;

        // فقط الصور
        if (
            message.type !== 'text/image_link'
        )
            return;

        const imageUrl = message.body;

        console.log('🖼️ تم استلام صورة');

        // تحميل الصورة
        const response = await fetch(imageUrl);

        const buffer = Buffer.from(
            await response.arrayBuffer()
        );

        // التأكد أنها كابتشا
        const isCaptcha =
            await isCaptchaByColor(buffer);

        if (!isCaptcha) {

            console.log('⏭️ ليست كابتشا');

            return;
        }

        console.log('✅ تم اكتشاف كابتشا');

        // استخراج اسم اللاعب
        const playerName =
            await extractPlayerName(buffer);

        console.log(`👤 اللاعب: ${playerName}`);

        // فلترة الاسم
        if (
            !playerName
                .toLowerCase()
                .includes(
                    TARGET_PLAYER_NAME.toLowerCase()
                )
        ) {

            console.log(
                '⏭️ الاسم غير مطابق'
            );

            return;
        }

        console.log('✅ الاسم مطابق');

        // حل الكابتشا
        const code =
            await solveCaptcha(buffer);

        if (!code) {

            console.log(
                '❌ لم يتم استخراج الكود'
            );

            return;
        }

        console.log(`🔑 الكود: ${code}`);

        // إرسال الحل
        await client.messaging.sendGroupMessage(
            CHANNEL_ID,
            `#${code}`
        );

        console.log(
            `✅ تم إرسال #${code}`
        );

    } catch (err) {

        console.error(
            '⚠️ خطأ أثناء معالجة الصورة:',
            err.message
        );

    }

});

// ========================================
// كشف الكابتشا
// ========================================

async function isCaptchaByColor(buffer) {

    const {
        data,
        info
    } = await sharp(buffer)
        .raw()
        .ensureAlpha()
        .toBuffer({
            resolveWithObject: true
        });

    let redPixels = 0;

    const totalPixels =
        info.width * info.height;

    for (let i = 0; i < data.length; i += 4) {

        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        if (
            r > 120 &&
            r > (g + 30) &&
            r > (b + 30)
        ) {

            redPixels++;
        }
    }

    const percentage =
        (redPixels / totalPixels) * 100;

    return percentage > 40;
}

// ========================================
// استخراج اسم اللاعب
// ========================================

async function extractPlayerName(buffer) {

    try {

        const processedBuffer =
            await sharp(buffer)
                .greyscale()
                .normalize()
                .threshold(160)
                .sharpen()
                .toBuffer();

        const worker =
            await createWorker('ara+eng');

        const {
            data: { text }
        } = await worker.recognize(
            processedBuffer
        );

        await worker.terminate();

        const match = text.match(
            /اللاعب[:\s]+([^\n\r]+)/u
        );

        return match
            ? match[1].trim()
            : 'غير معروف';

    } catch (err) {

        console.log(
            '❌ خطأ استخراج الاسم'
        );

        return 'خطأ';
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
        .toBuffer({
            resolveWithObject: true
        });

    let minX = info.width;
    let minY = info.height;

    let maxX = 0;
    let maxY = 0;

    let found = false;

    // البحث عن الإطار الأصفر
    for (let y = 0; y < info.height; y++) {

        for (let x = 0; x < info.width; x++) {

            const idx =
                (y * info.width + x) * 4;

            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];

            if (
                r > 200 &&
                g > 200 &&
                b < 100
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

        throw new Error(
            'لم يتم العثور على الإطار الأصفر'
        );
    }

    const margin = 10;

    const width =
        (maxX - minX) - (margin * 2);

    const height =
        (maxY - minY) - (margin * 2);

    const processedBuffer =
        await sharp(buffer)
            .extract({
                left: minX + margin,
                top: minY + margin,
                width,
                height
            })
            .greyscale()
            .normalize()
            .linear(1.5, -0.2)
            .sharpen()
            .threshold(140)
            .toBuffer();

    const worker =
        await createWorker('eng+ara');

    await worker.setParameters({
        tessedit_pageseg_mode: '7'
    });

    const {
        data: { text }
    } = await worker.recognize(
        processedBuffer
    );

    await worker.terminate();

    return text
        .replace(
            /[^a-zA-Z0-9\u0621-\u064A]/g,
            ''
        )
        .trim();
}

// ========================================
// دالة الانتظار
// ========================================

function sleep(ms) {

    return new Promise(resolve =>
        setTimeout(resolve, ms)
    );
}

// ========================================
// تسجيل الدخول
// ========================================

client.login(
    process.env.U_MAIL,
    process.env.U_PASS
);
