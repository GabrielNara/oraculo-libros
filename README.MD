# 📚 Oráculo de tus Libros

Un agente local en Node.js que, a partir de tu biblioteca personal de PDFs, extrae fragmentos al azar y genera citas reflexivas usando un modelo LLM (Groq + LLaMA).

Cada cita:

- aparece como notificación de escritorio en Windows
- se guarda automáticamente en un archivo Markdown diario

Ideal para:

- motivación diaria
- redescubrir libros propios
- aprendizaje espaciado
- uso 100% local y privado

---

## ✨ Características

- 📖 Lee PDFs locales (sin subir libros a la nube)
- 🧠 Filtra fragmentos irrelevantes (índices, copyright, tablas)
- 🤖 Usa LLaMA vía Groq (rápido y barato)
- 🪟 Notificaciones nativas de Windows
- 📝 Registro diario en Markdown (`logs/YYYY-MM-DD.md`)
- ⏱ Intervalo configurable
- 🕒 Ventana horaria configurable
- 🚀 Arranque automático al iniciar sesión en Windows
- 📜 Log de ejecución persistente (`runtime.log`)

---

## 🧰 Stack

- Node.js
- Groq SDK
- LLaMA 3.1 (8B)
- pdf-parse
- node-notifier

---

## ⚙️ Instalación

```bash
git clone https://github.com/tu-usuario/oraculo-libros.git
cd oraculo-libros
npm install
```
