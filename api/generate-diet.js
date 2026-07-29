const DEFAULT_MODEL = 'gemini-2.5-flash';
const MAX_BODY_BYTES = 160 * 1024;
const REQUEST_WINDOW_MS = 60 * 1000;
const REQUEST_LIMIT = 8;

const requestBuckets = new Map();
const ALLOWED_DIETS = new Set(['vegetarian', 'eggetarian', 'non-vegetarian', 'vegan']);
const ALLOWED_SLOT_TYPES = new Set(['breakfast', 'lunch', 'snack', 'dinner']);

function sendJson(res, status, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(status).json(payload);
}

function sameOriginRequest(req) {
  const origin = req.headers.origin;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (!origin || !host) return true;
  try {
    return new URL(origin).host === String(host).split(',')[0].trim();
  } catch (error) {
    return false;
  }
}

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown').split(',')[0].trim();
}

function rateLimited(req) {
  const now = Date.now();
  const ip = clientIp(req);
  const current = requestBuckets.get(ip);
  if (!current || now - current.startedAt >= REQUEST_WINDOW_MS) {
    requestBuckets.set(ip, { startedAt: now, count: 1 });
    return false;
  }
  current.count += 1;
  if (requestBuckets.size > 500) {
    for (const [key, value] of requestBuckets) {
      if (now - value.startedAt >= REQUEST_WINDOW_MS) requestBuckets.delete(key);
    }
  }
  return current.count > REQUEST_LIMIT;
}

function parseBody(req) {
  const headerLength = Number(req.headers['content-length'] || 0);
  if (headerLength > MAX_BODY_BYTES) throw new Error('request-too-large');
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    if (Buffer.byteLength(req.body, 'utf8') > MAX_BODY_BYTES) throw new Error('request-too-large');
    return JSON.parse(req.body);
  }
  return {};
}

function boundedNumber(value, min, max, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
}

function cleanString(value, maxLength = 80) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, maxLength);
}

function normalizeAllergy(value) {
  const normalized = cleanString(value, 40).toLowerCase();
  const aliases = {
    dairy: 'milk',
    'tree nuts': 'tree-nuts',
    nuts: 'tree-nuts',
    peanut: 'peanuts',
    egg: 'eggs',
    fish: 'seafood'
  };
  return aliases[normalized] || normalized;
}

function sanitizeStringArray(value, maxItems = 12) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => cleanString(item, 40)).filter(Boolean))].slice(0, maxItems);
}

function sanitizeProfile(input) {
  const profile = input && typeof input === 'object' ? input : {};
  const allergies = sanitizeStringArray(profile.allergies, 16).map(normalizeAllergy).filter(value => value && value !== 'none');
  const customAllergies = sanitizeStringArray(profile.customAllergies, 12).map(normalizeAllergy).filter(Boolean);
  return {
    dietType: ALLOWED_DIETS.has(profile.dietType) ? profile.dietType : 'vegetarian',
    allergies: [...new Set([...allergies, ...customAllergies])]
  };
}

function sanitizeMenu(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  return input.slice(0, 100).map(rawItem => {
    const item = rawItem && typeof rawItem === 'object' ? rawItem : {};
    const id = cleanString(item.id, 180);
    const types = sanitizeStringArray(item.types, 6)
      .map(value => value.toLowerCase())
      .filter(value => ALLOWED_SLOT_TYPES.has(value));
    return {
      id,
      name: cleanString(item.name, 100),
      description: cleanString(item.description, 180),
      types: [...new Set(types)],
      price: boundedNumber(item.price, 1, 100000, 0),
      isVeg: item.isVeg === true,
      tags: sanitizeStringArray(item.tags, 12),
      allergens: sanitizeStringArray(item.allergens, 16).map(normalizeAllergy)
    };
  }).filter(item => {
    if (!item.id || !item.name || !item.types.length || !item.price || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function sanitizeSchedule(input) {
  if (!Array.isArray(input) || input.length !== 7) throw new Error('invalid-schedule');
  return input.map((day, dayIndex) => {
    if (!day || typeof day !== 'object' || !/^\d{4}-\d{2}-\d{2}$/.test(day.date || '')) throw new Error('invalid-schedule');
    if (!Array.isArray(day.slots) || day.slots.length < 2 || day.slots.length > 6) throw new Error('invalid-schedule');
    const slotKeys = new Set();
    const slots = day.slots.map((slot, slotIndex) => {
      const slotKey = cleanString(slot.slotKey, 32);
      const type = cleanString(slot.type, 16).toLowerCase();
      if (!slotKey || slotKeys.has(slotKey) || !ALLOWED_SLOT_TYPES.has(type)) throw new Error('invalid-schedule');
      slotKeys.add(slotKey);
      return {
        slotKey,
        slotLabel: cleanString(slot.slotLabel, 32) || `Meal ${slotIndex + 1}`,
        type,
        time: /^\d{1,2}:\d{2} (AM|PM)$/.test(slot.time || '') ? slot.time : ''
      };
    });
    return {
      label: cleanString(day.label, 16) || `Day ${dayIndex + 1}`,
      shortLabel: cleanString(day.shortLabel, 8) || `D${dayIndex + 1}`,
      date: day.date,
      slots
    };
  });
}

function itemAllowed(item, profile, type) {
  if (!item || !item.types.includes(type)) return false;
  if (['vegetarian', 'vegan', 'eggetarian'].includes(profile.dietType) && !item.isVeg) return false;
  if (profile.dietType === 'vegan' && item.allergens.some(value => value === 'milk' || value === 'eggs')) return false;
  if (profile.allergies.some(value => item.allergens.includes(value))) return false;
  const text = `${item.name} ${item.description} ${item.allergens.join(' ')}`.toLowerCase();
  return !profile.allergies.some(value => value.length > 2 && text.includes(value));
}

function deterministicChoice(menu, type, profile, usedIds, seed) {
  const choices = menu
    .filter(item => itemAllowed(item, profile, type))
    .sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
  if (!choices.length) return null;
  const freshChoices = choices.filter(item => !usedIds.includes(item.id));
  const pool = freshChoices.length ? freshChoices : choices;
  return pool[Math.abs(seed) % pool.length];
}

function buildPrompt(profile, schedule, menu) {
  const availableMenu = menu.map(item => ({
    id: item.id,
    name: item.name,
    description: item.description,
    mealTypes: item.types,
    price: item.price,
    isVegetarian: item.isVeg,
    tags: item.tags,
    allergens: item.allergens
  }));
  return JSON.stringify({
    task: 'Choose exactly one currently available merchant item ID for every requested slot in this seven-day schedule.',
    dietaryPreferences: profile,
    rules: [
      'Use only item IDs from availableMenu.',
      'The selected item mealTypes must contain the requested slot type.',
      'Never select an item containing a saved allergy or avoid item.',
      'Respect the vegetarian, eggetarian or vegan preference.',
      'Prefer variety and avoid repeating the same item in consecutive slots when alternatives exist.',
      'Give a short factual menu-match reason without medical or nutrition claims.',
      'If no matching item exists, use itemId no-safe-menu-item.'
    ],
    availableMenu,
    schedule
  });
}

function responseSchema() {
  return {
    type: 'object',
    properties: {
      days: {
        type: 'array',
        minItems: 7,
        maxItems: 7,
        items: {
          type: 'object',
          properties: {
            date: { type: 'string' },
            meals: {
              type: 'array',
              minItems: 2,
              maxItems: 6,
              items: {
                type: 'object',
                properties: {
                  slotKey: { type: 'string' },
                  itemId: { type: 'string' },
                  reason: { type: 'string' }
                },
                required: ['slotKey', 'itemId', 'reason']
              }
            }
          },
          required: ['date', 'meals']
        }
      }
    },
    required: ['days']
  };
}

async function callGemini(apiKey, model, profile, schedule, menu) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 26000);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: 'You are Hapycure\'s constrained menu-matching engine. Follow the supplied live menu and dietary rules exactly. Output only the requested JSON.' }]
        },
        contents: [{ role: 'user', parts: [{ text: buildPrompt(profile, schedule, menu) }] }],
        generationConfig: {
          temperature: 0.25,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
          responseSchema: responseSchema()
        }
      }),
      signal: controller.signal
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = cleanString(payload?.error?.message || `Gemini request failed (${response.status})`, 180);
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }

    const text = (payload.candidates?.[0]?.content?.parts || []).map(part => part.text || '').join('').trim();
    if (!text) throw new Error('Gemini returned an empty recommendation.');
    return JSON.parse(text);
  } finally {
    clearTimeout(timeout);
  }
}

function validateAndBuildDays(generated, schedule, profile, menu) {
  const menuById = new Map(menu.map(item => [item.id, item]));
  const generatedDays = Array.isArray(generated?.days) ? generated.days : [];
  const byDate = new Map(generatedDays.filter(day => day && typeof day === 'object').map(day => [day.date, day]));
  const recentIds = [];

  return schedule.map((day, dayIndex) => {
    const aiDay = byDate.get(day.date) || generatedDays[dayIndex] || {};
    const aiMeals = Array.isArray(aiDay.meals) ? aiDay.meals : [];
    const aiBySlot = new Map(aiMeals.filter(meal => meal && typeof meal === 'object').map(meal => [cleanString(meal.slotKey, 32), meal]));

    const meals = day.slots.map((slot, slotIndex) => {
      const aiMeal = aiBySlot.get(slot.slotKey) || aiMeals[slotIndex] || {};
      let item = menuById.get(cleanString(aiMeal.itemId, 180));
      let source = 'gemini';
      if (!itemAllowed(item, profile, slot.type)) {
        item = deterministicChoice(menu, slot.type, profile, recentIds.slice(-3), (dayIndex * 11) + slotIndex);
        source = 'validated-fallback';
      }
      if (item) recentIds.push(item.id);
      return {
        slotKey: slot.slotKey,
        slotLabel: slot.slotLabel,
        type: slot.type,
        time: slot.time,
        itemId: item ? item.id : 'no-safe-menu-item',
        reason: item
          ? cleanString(aiMeal.reason || 'Available partner-menu match for this slot.', 100)
          : 'No active merchant item matches this slot.',
        source
      };
    });

    return { label: day.label, shortLabel: day.shortLabel, date: day.date, meals };
  });
}

module.exports = async function generateDiet(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
  if (!sameOriginRequest(req)) return sendJson(res, 403, { ok: false, error: 'Cross-origin requests are not allowed.' });
  if (rateLimited(req)) return sendJson(res, 429, { ok: false, error: 'Too many menu generations. Please wait a minute and try again.' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return sendJson(res, 503, { ok: false, error: 'Gemini API is not configured.' });

  try {
    const body = parseBody(req);
    const profile = sanitizeProfile(body.profile);
    const schedule = sanitizeSchedule(body.schedule);
    const menu = sanitizeMenu(body.menu);
    const menuVersion = cleanString(body.menuVersion, 180);
    if (!menu.length || !menuVersion) return sendJson(res, 422, { ok: false, error: 'No active merchant menu is available.' });

    const model = cleanString(process.env.GEMINI_MODEL || DEFAULT_MODEL, 80) || DEFAULT_MODEL;
    const generated = await callGemini(apiKey, model, profile, schedule, menu);
    const days = validateAndBuildDays(generated, schedule, profile, menu);

    return sendJson(res, 200, {
      ok: true,
      source: 'gemini',
      model,
      menuVersion,
      generatedAt: new Date().toISOString(),
      days
    });
  } catch (error) {
    if (error.message === 'request-too-large') return sendJson(res, 413, { ok: false, error: 'Request is too large.' });
    if (error.message === 'invalid-schedule') return sendJson(res, 400, { ok: false, error: 'Invalid meal schedule.' });
    if (error.name === 'AbortError') return sendJson(res, 504, { ok: false, error: 'Gemini took too long to respond. Your local plan is still available.' });
    console.error('generate-diet error:', error && error.message ? error.message : error);
    return sendJson(res, 502, { ok: false, error: 'Could not generate a menu plan right now. Your local plan is still available.' });
  }
};
