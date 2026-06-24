import { potluckItems } from "./config.js";

const json = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init.headers || {})
    }
  });

const normalizeName = (value) => value.trim().replace(/\s+/g, " ");
const CUSTOM_ITEM_PREFIX = "custom-";

function normalizeCustomItem(item) {
  if (!item || typeof item !== "object") {
    return null;
  }

  const id = typeof item.id === "string" ? item.id : "";
  const label = typeof item.label === "string" ? item.label.trim().replace(/\s+/g, " ") : "";
  const details = typeof item.details === "string" ? item.details.trim().replace(/\s+/g, " ") : "";

  if (!id.startsWith(CUSTOM_ITEM_PREFIX) || label.length < 2) {
    return null;
  }

  return {
    id,
    label,
    details,
    isCustom: true
  };
}

function normalizeState(parsed) {
  const claims = parsed?.claims && typeof parsed.claims === "object" ? parsed.claims : {};
  const customItems = Array.isArray(parsed?.customItems) ? parsed.customItems.map(normalizeCustomItem).filter(Boolean) : [];

  return {
    claims,
    customItems,
    updatedAt: parsed?.updatedAt || null
  };
}

async function readState(env) {
  const key = env.POTLUCK_STATE_KEY || "potluck-state.json";
  const object = await env.POTLUCK_BUCKET.get(key);

  if (!object) {
    return { claims: {}, customItems: [], updatedAt: null };
  }

  try {
    return normalizeState(await object.json());
  } catch {
    return { claims: {}, customItems: [], updatedAt: null };
  }
}

async function writeState(env, state) {
  const key = env.POTLUCK_STATE_KEY || "potluck-state.json";
  await env.POTLUCK_BUCKET.put(key, JSON.stringify(state, null, 2), {
    httpMetadata: {
      contentType: "application/json; charset=utf-8"
    }
  });
}

function buildViewState(state) {
  const baseItems = potluckItems.map((item) => ({
    ...item,
    isCustom: false,
    claimedBy: state.claims[item.id] || null
  }));

  const customItems = state.customItems.map((item) => ({
    ...item,
    claimedBy: state.claims[item.id] || null
  }));

  return [...baseItems, ...customItems];
}

function findItem(state, itemId) {
  return buildViewState(state).find((item) => item.id === itemId) || null;
}

function responseWithItems(state, payload = {}, init = {}) {
  return json(
    {
      ...payload,
      items: buildViewState(state),
      updatedAt: state.updatedAt
    },
    init
  );
}

function makeCustomItemId() {
  return `${CUSTOM_ITEM_PREFIX}${crypto.randomUUID()}`;
}

async function handleGetItems(env) {
  const state = await readState(env);
  return json({
    items: buildViewState(state),
    updatedAt: state.updatedAt
  });
}

async function handleClaim(request, env) {
  const body = await request.json().catch(() => null);
  const itemId = typeof body?.itemId === "string" ? body.itemId : "";
  const rawName = typeof body?.name === "string" ? body.name : "";
  const name = normalizeName(rawName);

  if (name.length < 2 || name.length > 50) {
    return json({ error: "Please enter a name between 2 and 50 characters." }, { status: 400 });
  }

  const state = await readState(env);
  const item = findItem(state, itemId);

  if (!item) {
    return json({ error: "Unknown item." }, { status: 400 });
  }

  const existingClaim = state.claims[itemId];

  if (existingClaim && existingClaim.toLowerCase() !== name.toLowerCase()) {
    return responseWithItems(
      state,
      { error: "That item has already been claimed." },
      { status: 409 }
    );
  }

  state.claims[itemId] = name;
  state.updatedAt = new Date().toISOString();
  await writeState(env, state);

  return responseWithItems(state, { ok: true });
}

async function handleAddCustomItem(request, env) {
  const body = await request.json().catch(() => null);
  const rawName = typeof body?.name === "string" ? body.name : "";
  const rawLabel = typeof body?.label === "string" ? body.label : "";
  const rawDetails = typeof body?.details === "string" ? body.details : "";
  const name = normalizeName(rawName);
  const label = normalizeName(rawLabel);
  const details = normalizeName(rawDetails);

  if (name.length < 2 || name.length > 50) {
    return json({ error: "Please enter a name between 2 and 50 characters." }, { status: 400 });
  }

  if (label.length < 2 || label.length > 50) {
    return json({ error: "Please describe the item in 2 to 50 characters." }, { status: 400 });
  }

  if (details.length > 80) {
    return json({ error: "Extra notes can be at most 80 characters." }, { status: 400 });
  }

  const state = await readState(env);
  const itemId = makeCustomItemId();

  state.customItems.push({
    id: itemId,
    label,
    details,
    isCustom: true
  });
  state.claims[itemId] = name;
  state.updatedAt = new Date().toISOString();
  await writeState(env, state);

  return responseWithItems(state, { ok: true }, { status: 201 });
}

async function handleRelease(request, env) {
  const body = await request.json().catch(() => null);
  const itemId = typeof body?.itemId === "string" ? body.itemId : "";
  const rawName = typeof body?.name === "string" ? body.name : "";
  const name = normalizeName(rawName);

  const state = await readState(env);
  const item = findItem(state, itemId);

  if (!item) {
    return json({ error: "Unknown item." }, { status: 400 });
  }

  const existingClaim = state.claims[itemId];

  if (!existingClaim) {
    return responseWithItems(state, { ok: true });
  }

  if (!name || existingClaim.toLowerCase() !== name.toLowerCase()) {
    return json({ error: "Only the current claimant can remove this signup." }, { status: 403 });
  }

  delete state.claims[itemId];

  if (item.isCustom) {
    state.customItems = state.customItems.filter((customItem) => customItem.id !== itemId);
  }

  state.updatedAt = new Date().toISOString();
  await writeState(env, state);

  return responseWithItems(state, { ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/items" && request.method === "GET") {
      return handleGetItems(env);
    }

    if (url.pathname === "/api/claim" && request.method === "POST") {
      return handleClaim(request, env);
    }

    if (url.pathname === "/api/items/custom" && request.method === "POST") {
      return handleAddCustomItem(request, env);
    }

    if (url.pathname === "/api/release" && request.method === "POST") {
      return handleRelease(request, env);
    }

    return env.ASSETS.fetch(request);
  }
};
