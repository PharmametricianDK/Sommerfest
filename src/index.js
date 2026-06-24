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

async function readState(env) {
  const key = env.POTLUCK_STATE_KEY || "potluck-state.json";
  const object = await env.POTLUCK_BUCKET.get(key);

  if (!object) {
    return { claims: {}, updatedAt: null };
  }

  try {
    const parsed = await object.json();
    return {
      claims: parsed?.claims && typeof parsed.claims === "object" ? parsed.claims : {},
      updatedAt: parsed?.updatedAt || null
    };
  } catch {
    return { claims: {}, updatedAt: null };
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
  return potluckItems.map((item) => ({
    ...item,
    claimedBy: state.claims[item.id] || null
  }));
}

function validateItem(itemId) {
  return potluckItems.some((item) => item.id === itemId);
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

  if (!validateItem(itemId)) {
    return json({ error: "Unknown item." }, { status: 400 });
  }

  if (name.length < 2 || name.length > 50) {
    return json({ error: "Please enter a name between 2 and 50 characters." }, { status: 400 });
  }

  const state = await readState(env);
  const existingClaim = state.claims[itemId];

  if (existingClaim && existingClaim.toLowerCase() !== name.toLowerCase()) {
    return json(
      {
        error: "That item has already been claimed.",
        items: buildViewState(state),
        updatedAt: state.updatedAt
      },
      { status: 409 }
    );
  }

  state.claims[itemId] = name;
  state.updatedAt = new Date().toISOString();
  await writeState(env, state);

  return json({
    ok: true,
    items: buildViewState(state),
    updatedAt: state.updatedAt
  });
}

async function handleRelease(request, env) {
  const body = await request.json().catch(() => null);
  const itemId = typeof body?.itemId === "string" ? body.itemId : "";
  const rawName = typeof body?.name === "string" ? body.name : "";
  const name = normalizeName(rawName);

  if (!validateItem(itemId)) {
    return json({ error: "Unknown item." }, { status: 400 });
  }

  const state = await readState(env);
  const existingClaim = state.claims[itemId];

  if (!existingClaim) {
    return json({
      ok: true,
      items: buildViewState(state),
      updatedAt: state.updatedAt
    });
  }

  if (!name || existingClaim.toLowerCase() !== name.toLowerCase()) {
    return json({ error: "Only the current claimant can remove this signup." }, { status: 403 });
  }

  delete state.claims[itemId];
  state.updatedAt = new Date().toISOString();
  await writeState(env, state);

  return json({
    ok: true,
    items: buildViewState(state),
    updatedAt: state.updatedAt
  });
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

    if (url.pathname === "/api/release" && request.method === "POST") {
      return handleRelease(request, env);
    }

    return env.ASSETS.fetch(request);
  }
};
