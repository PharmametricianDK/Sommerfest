const els = {
  items: document.querySelector("#items"),
  message: document.querySelector("#message"),
  guestName: document.querySelector("#guestName"),
  lastUpdated: document.querySelector("#lastUpdated"),
  refreshButton: document.querySelector("#refreshButton"),
  itemTemplate: document.querySelector("#itemTemplate"),
  customItemForm: document.querySelector("#customItemForm"),
  customItemLabel: document.querySelector("#customItemLabel"),
  customItemDetails: document.querySelector("#customItemDetails")
};

let currentItems = [];
const reservedItemsContainer = document.createElement("div");
reservedItemsContainer.className = "items";
reservedItemsContainer.setAttribute("aria-live", "polite");

els.customItemForm.insertAdjacentElement("afterend", reservedItemsContainer);
els.items.insertAdjacentElement("afterend", els.customItemForm);

function setMessage(text, type = "") {
  els.message.textContent = text;
  els.message.className = `message ${type}`.trim();
}

function getName() {
  return els.guestName.value.trim().replace(/\s+/g, " ");
}

function formatTimestamp(value) {
  if (!value) {
    return "No signups yet.";
  }

  const date = new Date(value);
  return `Last updated ${date.toLocaleString()}`;
}

function resetCustomItemForm() {
  els.customItemForm.reset();
}

function createItemCard(item) {
  const fragment = els.itemTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".item-card");
  const title = fragment.querySelector(".item-title");
  const details = fragment.querySelector(".item-details");
  const tag = fragment.querySelector(".item-tag");
  const claimedBy = fragment.querySelector(".claimed-by");
  const claimButton = fragment.querySelector(".claim-button");
  const releaseButton = fragment.querySelector(".release-button");

  title.textContent = item.label;
  details.textContent = item.details || "";
  tag.textContent = item.isCustom ? "Gaestetilfoejelse" : "";
  tag.hidden = !item.isCustom;

  if (item.claimedBy) {
    card.dataset.claimed = "true";
    claimedBy.textContent = `Claimed by ${item.claimedBy}`;
    claimButton.disabled = true;
  } else {
    claimedBy.textContent = "Still needed";
    releaseButton.disabled = true;
  }

  claimButton.addEventListener("click", () => submitClaim(item.id));
  releaseButton.addEventListener("click", () => releaseClaim(item.id));

  return fragment;
}

function renderItemList(container, items) {
  container.innerHTML = "";

  for (const item of items) {
    container.appendChild(createItemCard(item));
  }
}

function renderItems(items) {
  currentItems = items;

  const availablePredefinedItems = items.filter((item) => !item.isCustom && !item.claimedBy);
  const availableCustomItems = items.filter((item) => item.isCustom && !item.claimedBy);
  const reservedPredefinedItems = items.filter((item) => !item.isCustom && item.claimedBy);
  const reservedCustomItems = items.filter((item) => item.isCustom && item.claimedBy);

  renderItemList(els.items, [...availablePredefinedItems, ...availableCustomItems]);
  renderItemList(reservedItemsContainer, [...reservedPredefinedItems, ...reservedCustomItems]);
}

async function loadItems() {
  setMessage("");

  try {
    const response = await fetch("/api/items", { cache: "no-store" });
    const data = await response.json();
    renderItems(data.items || []);
    els.lastUpdated.textContent = formatTimestamp(data.updatedAt);
  } catch {
    setMessage("Could not load the pot-luck list. Try refreshing.", "error");
  }
}

async function submitClaim(itemId) {
  const name = getName();

  if (name.length < 2) {
    setMessage("Please enter your name before claiming an item.", "error");
    els.guestName.focus();
    return;
  }

  setMessage("Saving your signup...");

  try {
    const response = await fetch("/api/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemId, name })
    });

    const data = await response.json();

    if (!response.ok) {
      renderItems(data.items || currentItems);
      els.lastUpdated.textContent = formatTimestamp(data.updatedAt);
      setMessage(data.error || "Could not save your signup.", "error");
      return;
    }

    renderItems(data.items || []);
    els.lastUpdated.textContent = formatTimestamp(data.updatedAt);
    setMessage("Saved. Thanks for signing up.", "success");
  } catch {
    setMessage("Could not save your signup. Please try again.", "error");
  }
}

async function submitCustomItem(event) {
  event.preventDefault();

  const name = getName();
  const label = els.customItemLabel.value.trim().replace(/\s+/g, " ");
  const details = els.customItemDetails.value.trim().replace(/\s+/g, " ");

  if (name.length < 2) {
    setMessage("Please enter your name before adding an item.", "error");
    els.guestName.focus();
    return;
  }

  if (label.length < 2) {
    setMessage("Describe what you want to bring before adding it.", "error");
    els.customItemLabel.focus();
    return;
  }

  setMessage("Adding your item...");

  try {
    const response = await fetch("/api/items/custom", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, label, details })
    });

    const data = await response.json();

    if (!response.ok) {
      renderItems(data.items || currentItems);
      els.lastUpdated.textContent = formatTimestamp(data.updatedAt);
      setMessage(data.error || "Could not add your item.", "error");
      return;
    }

    renderItems(data.items || []);
    els.lastUpdated.textContent = formatTimestamp(data.updatedAt);
    resetCustomItemForm();
    setMessage("Your item was added and reserved for you.", "success");
  } catch {
    setMessage("Could not add your item. Please try again.", "error");
  }
}

async function releaseClaim(itemId) {
  const name = getName();

  if (name.length < 2) {
    setMessage("Enter your name to remove your signup.", "error");
    els.guestName.focus();
    return;
  }

  setMessage("Removing your signup...");

  try {
    const response = await fetch("/api/release", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemId, name })
    });

    const data = await response.json();

    if (!response.ok) {
      setMessage(data.error || "Could not remove your signup.", "error");
      return;
    }

    renderItems(data.items || []);
    els.lastUpdated.textContent = formatTimestamp(data.updatedAt);
    setMessage("Your signup was removed.", "success");
  } catch {
    setMessage("Could not remove your signup. Please try again.", "error");
  }
}

els.refreshButton.addEventListener("click", loadItems);
els.customItemForm.addEventListener("submit", submitCustomItem);

loadItems();
