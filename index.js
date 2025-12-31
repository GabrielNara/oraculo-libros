import "dotenv/config";
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");


import notifier from "node-notifier";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const BOOKS_DIR = process.env.BOOKS_DIR || process.cwd();
const INTERVAL_MINUTES = Number(process.env.INTERVAL_MINUTES || 180);
const MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

// --- Helpers ---
function notify(title, message) {
    notifier.notify({
        title,
        message,
        wait: true,
        timeout: 10,
    });
}


function listPdfs(dir) {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    return items
        .filter((d) => d.isFile() && d.name.toLowerCase().endsWith(".pdf"))
        .map((d) => path.join(dir, d.name));
}

function randomPick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function normalizeText(t) {
    return t
        .replace(/\r/g, " ")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

// Filtro barato para evitar mandar índices/copyright y basura
function looksLikeJunk(fragment) {
    const s = fragment.toLowerCase();

    if (fragment.length < 220) return true;

    // palabras típicas de front-matter / tablas / índices
    const junkHints = [
        "isbn",
        "copyright",
        "todos los derechos reservados",
        "índice",
        "indice",
        "tabla",
        "capítulo",
        "capitulo",
        "contenido",
        "contents",
    ];
    if (junkHints.some((h) => s.includes(h))) return true;

    // demasiados números/puntos (estilo índice)
    const digits = (fragment.match(/\d/g) || []).length;
    if (digits / fragment.length > 0.08) return true;

    // demasiadas líneas cortas (tabla)
    const lines = fragment.split("\n").filter(Boolean);
    const shortLines = lines.filter((l) => l.trim().length < 30).length;
    if (lines.length >= 8 && shortLines / lines.length > 0.6) return true;

    return false;
}

// Tomar un fragmento “ventana” de tamaño razonable
function pickFragment(fullText) {
    const text = normalizeText(fullText);
    if (text.length < 800) return null;

    // Partimos por párrafos, elegimos uno y armamos ventana
    const paras = text.split("\n\n").map((p) => p.trim()).filter(Boolean);
    if (paras.length < 5) return null;

    for (let attempt = 0; attempt < 12; attempt++) {
        const i = Math.floor(Math.random() * paras.length);
        const window = [paras[i], paras[i + 1], paras[i + 2]].filter(Boolean).join("\n\n");

        const clipped = window.slice(0, 1600); // controla tokens aprox
        if (!looksLikeJunk(clipped)) return clipped;
    }

    return null;
}

async function extractPdfText(filePath) {
    const data = fs.readFileSync(filePath);

    const parsed = await pdfParse(data);

    return parsed.text || "";
}

async function askGroqForQuote({ bookName, fragment }) {
    const prompt = `
Actuás como un bibliotecario sabio, simple y práctico.
Te paso un fragmento del libro: "${bookName}"

Tareas:
1) Si el fragmento es basura (índice, tabla, créditos, texto inconexo), respondé EXACTO: SKIP
2) Si sirve, extraé UNA cita potente (máx 2 oraciones) y una reflexión breve (1-2 oraciones).
3) Respondé SOLO JSON válido con estas claves:
{"cita":"...","reflexion":"..."}

Fragmento:
"""${fragment}"""
`.trim();

    const res = await groq.chat.completions.create({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 180, // limita output (tokens)
    });

    const content = res.choices?.[0]?.message?.content?.trim() || "";
    return content;
}

function safeJsonParse(str) {
    try {
        return JSON.parse(str);
    } catch {
        return null;
    }
}

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function saveQuoteToDailyMd({ cita, reflexion, bookName }) {
    const logsDir = path.join(process.cwd(), "logs");
    ensureDir(logsDir);

    const now = new Date();
    const date = now.toLocaleDateString("sv-SE"); // YYYY-MM-DD

    const time = now.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

    const filePath = path.join(logsDir, `${date}.md`);

    const entry =
        `## 🕒 ${time} — 📚 ${bookName}

   > ${cita}

   _${reflexion}_

   ---

   `;

    fs.appendFileSync(filePath, entry, "utf8");
    return filePath;
}


async function runOnce() {
    try {
        const pdfs = listPdfs(BOOKS_DIR);
        if (!pdfs.length) {
            notify("Oráculo", `No encontré PDFs en: ${BOOKS_DIR}`);
            return;
        }

        const chosen = randomPick(pdfs);
        const bookName = path.basename(chosen);

        const fullText = await extractPdfText(chosen);

        // console.log("Texto extraído (preview):", fullText.slice(0, 200));

        const fragment = pickFragment(fullText);

        if (!fragment) {
            notify("Oráculo", `Hoy no pude sacar un fragmento decente de: ${bookName}`);
            return;
        }

        // Budget de intentos con LLM (por si responde SKIP)
        for (let i = 0; i < 6; i++) {
            const out = await askGroqForQuote({ bookName, fragment });

            if (out === "SKIP") continue;

            const json = safeJsonParse(out);
            if (!json?.cita) continue;

            const filePath = saveQuoteToDailyMd({
                cita: json.cita,
                reflexion: json.reflexion,
                bookName,
            });

            const msg = `${json.cita}\n\n${json.reflexion}\n\n(${bookName})\n\nGuardado en: ${filePath}`;
            //  const msg = `${json.cita}\n\n(${bookName})\n\n📄 Guardado en logs`;

            notify("📚 Oráculo de tus Libros", msg);
            return;

        }

        notify("Oráculo", `Me tocó puro “front matter” hoy 😅 (${bookName})`);
    } catch (err) {
        notify("Oráculo - Error", String(err?.message || err));
    }
}

function startTimer() {
    const ms = INTERVAL_MINUTES * 60 * 1000;

    // Opcional: disparar una vez al iniciar
    runOnce();

    setInterval(() => {
        runOnce();
    }, ms);

    console.log(`Oráculo corriendo. Intervalo: ${INTERVAL_MINUTES} min | Carpeta: ${BOOKS_DIR}`);
}

startTimer();
