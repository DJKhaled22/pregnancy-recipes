require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a pregnancy nutrition assistant specialising in first-trimester health. You prioritise folate, iron, protein, and omega-3 rich ingredients. You always avoid foods contraindicated in pregnancy (raw fish, unpasteurised dairy, high-mercury fish, undercooked meat, deli meats, raw eggs). Keep recipes simple and realistic for someone who may be experiencing fatigue or nausea. Respond only in valid JSON with no markdown formatting, no code fences, no backticks.`;

function extractJSON(text) {
  // Strip markdown code fences if present
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  // Find the first { or [ and last } or ] to extract just the JSON
  const start = cleaned.search(/[{[]/);
  const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
  if (start === -1 || end === -1) throw new Error('No JSON found in response: ' + cleaned.slice(0, 100));
  return JSON.parse(cleaned.slice(start, end + 1));
}

app.get('/api/test', async (req, res) => {
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 20,
      messages: [{ role: 'user', content: 'Say hi' }],
    });
    res.json({ ok: true, response: message.content[0].text });
  } catch (err) {
    res.json({ ok: false, error: err.message, type: err.constructor.name });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/recipe', async (req, res) => {
  const { ingredients, freezerFriendly, differentMeal } = req.body;

  if (!ingredients || !ingredients.trim()) {
    return res.status(400).json({ error: 'Ingredients are required.' });
  }

  let prompt = `Using some (not necessarily all) of these ingredients: ${ingredients}, generate one pregnancy-safe recipe for a first-trimester meal. Return valid JSON in this exact format:
{
  "name": "...",
  "type": "soup / stir-fry / etc",
  "ingredientsUsed": ["..."],
  "instructions": ["step 1", "step 2", "..."],
  "nutritionNote": "brief note on why this is good for first trimester"
}`;

  if (freezerFriendly) {
    prompt += '\n\nThe recipe must be suitable for batch cooking, freezing, and reheating.';
  }
  if (differentMeal) {
    prompt += '\n\nReturn a completely different recipe than you might have suggested before — vary the dish type.';
  }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content[0].text;
    const json = extractJSON(text);
    res.json(json);
  } catch (err) {
    console.error('Recipe error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate recipe. Please try again.' });
  }
});

app.post('/api/snacks', async (req, res) => {
  const { ingredients } = req.body;

  const prompt = `Suggest 4–5 varied, no-cook snack ideas that are safe and beneficial for early pregnancy. Mix it up — include something sweet, something savoury, and something crunchy. Return valid JSON as an array in this exact format:
[
  { "name": "...", "ingredients": ["..."], "why": "brief benefit" }
]`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content[0].text;
    const json = extractJSON(text);
    res.json(json);
  } catch (err) {
    console.error('Snacks error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate snack ideas. Please try again.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
