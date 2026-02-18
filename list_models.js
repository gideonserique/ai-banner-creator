const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function listModels() {
    try {
        const result = await genAI.listModels();
        console.log('Available Models:');
        result.models.forEach(m => console.log(`- ${m.name} (${m.displayName})`));
    } catch (e) {
        console.error('Error listing models:', e);
    }
}

listModels();
