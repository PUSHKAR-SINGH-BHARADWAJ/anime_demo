const API = "https://graphql.anilist.co";

const animeGrid = document.getElementById("anime-grid");
const animeSearch = document.getElementById("anime-search");
const genreFilter = document.getElementById("genre-filter");
const typeFilter = document.getElementById("type-filter");
const resultsTitle = document.getElementById("results-title");
const resultsCount = document.getElementById("results-count");
const loadMoreButton = document.getElementById("load-more");
const animeDialog = document.getElementById("anime-dialog");
const animeDetails = document.getElementById("anime-details");
const characterDialog = document.getElementById("character-dialog");
const characterDetails = document.getElementById("character-details");
const characterResults = document.getElementById("character-results");

let currentPage = 1;
let currentAnime = [];
let currentSearch = "";
let currentGenre = "";
let currentType = "";
let isLoading = false;
let hasNextPage = false;
let requestNumber = 0;
let characterRequestNumber = 0;

const ANIME_FIELDS = `
  id
  title { romaji english native }
  coverImage { large extraLarge }
  format episodes status seasonYear averageScore description siteUrl
  genres studios { nodes { name } }
  tags { name rank }
`;

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}
function titleOf(item) {
  return item?.title?.english || item?.title?.romaji || item?.title?.native || "Untitled Anime";
}
function imageURL(item) {
  return item?.coverImage?.extraLarge || item?.coverImage?.large || "";
}
function plainText(value = "") {
  const doc = new DOMParser().parseFromString(value, "text/html");
  return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
}
async function gql(query, variables = {}) {
  const response = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ query, variables })
  });
  if (!response.ok) {
    if (response.status === 429) throw new Error("AniList rate limit reached. Wait a few seconds and try again.");
    throw new Error(`AniList API error: ${response.status}. Please try again.`);
  }
  const json = await response.json();
  if (json.errors?.length) throw new Error(json.errors[0].message || "AniList request failed.");
  return json.data;
}
function showMessage(message, isError = false) {
  animeGrid.innerHTML = `<div class="${isError ? "error-state" : "loading-state"}">${escapeHTML(message)}${isError ? '<br><button class="button secondary" id="retry-button">Try again</button>' : ""}</div>`;
  document.getElementById("retry-button")?.addEventListener("click", () => loadAnime(false));
}
function buildAnimeQuery(page) {
  const vars = { page, perPage: 24 };
  const declarations = ["$page: Int!", "$perPage: Int!"];
  let filters = "sort: [POPULARITY_DESC, SCORE_DESC]";
  if (currentSearch) {
    declarations.push("$search: String");
    vars.search = currentSearch;
    filters += ", search: $search";
    // When a title search is present, prioritize matching titles.
    filters = filters.replace("sort: [POPULARITY_DESC, SCORE_DESC]", "sort: SEARCH_MATCH");
  }
  if (currentGenre) {
    declarations.push("$genres: [String!]");
    vars.genres = [currentGenre];
    filters += ", genre_in: $genres";
  }
  if (currentType) {
    declarations.push("$format: MediaFormat");
    vars.format = currentType;
    filters += ", format: $format";
  }
  const query = `query (${declarations.join(", ")}) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { currentPage hasNextPage }
      media(type: ANIME, isAdult: false, ${filters}) { ${ANIME_FIELDS} }
    }
  }`;
  return { query, vars };
}
async function loadAnime(loadNextPage = false) {
  if (isLoading) return;
  isLoading = true;
  const thisRequest = ++requestNumber;
  const page = loadNextPage ? currentPage + 1 : 1;
  if (!loadNextPage) {
    currentAnime = [];
    showMessage("Finding anime for you...");
    loadMoreButton.hidden = true;
  } else {
    loadMoreButton.disabled = true;
    loadMoreButton.textContent = "Loading...";
  }
  const { query, vars } = buildAnimeQuery(page);
  try {
    const data = await gql(query, vars);
    if (thisRequest !== requestNumber) return;
    const list = data.Page.media || [];
    currentAnime = loadNextPage ? [...currentAnime, ...list] : list;
    currentPage = page;
    hasNextPage = Boolean(data.Page.pageInfo?.hasNextPage);
    renderAnime(currentAnime);
    const active = Boolean(currentSearch || currentGenre || currentType);
    resultsTitle.textContent = currentSearch ? `Results for "${currentSearch}"` : active ? "Your Anime Picks" : "Popular Anime";
    resultsCount.textContent = `${currentAnime.length} anime loaded${hasNextPage ? " · More to discover" : ""}`;
    loadMoreButton.hidden = !hasNextPage || currentAnime.length === 0;
  } catch (error) {
    if (thisRequest === requestNumber) showMessage(error.message || "Could not load anime.", true);
  } finally {
    if (thisRequest === requestNumber) {
      isLoading = false;
      loadMoreButton.disabled = false;
      loadMoreButton.textContent = "Load More Anime ↓";
    }
  }
}
function renderAnime(list) {
  if (!list.length) {
    animeGrid.innerHTML = '<div class="empty-state">No anime found for these filters.<br>Try another genre, category, or search term.</div>';
    return;
  }
  animeGrid.innerHTML = list.map((anime, index) => {
    const genres = anime.genres || [];
    const image = imageURL(anime);
    const title = titleOf(anime);
    const score = anime.averageScore ? `★ ${(anime.averageScore / 10).toFixed(1)}` : "Not rated";
    const year = anime.seasonYear || "Year unknown";
    const type = (anime.format || "ANIME").replaceAll("_", " ");
    return `<article class="anime-card">
      <div class="poster-wrap">
        ${image ? `<img class="poster" src="${escapeHTML(image)}" alt="${escapeHTML(title)} poster" loading="lazy" onerror="this.style.opacity='.2'">` : ""}
        <span class="score">${escapeHTML(score)}</span>
      </div>
      <div class="card-body">
        <span class="card-type">${escapeHTML(type)}</span>
        <h4 class="card-title">${escapeHTML(title)}</h4>
        <p class="card-genres">${escapeHTML(genres.slice(0, 3).join(" · ") || "Genres unavailable")}</p>
        <div class="card-footer"><span>${escapeHTML(String(year))}</span><button class="details-button" type="button" data-anime-index="${index}">View Details ↗</button></div>
      </div>
    </article>`;
  }).join("");
}

document.getElementById("filter-form").addEventListener("submit", event => {
  event.preventDefault();
  currentSearch = animeSearch.value.trim();
  currentGenre = genreFilter.value;
  currentType = typeFilter.value;
  loadAnime(false);
});
document.getElementById("reset-filters").addEventListener("click", () => {
  animeSearch.value = ""; genreFilter.value = ""; typeFilter.value = "";
  currentSearch = ""; currentGenre = ""; currentType = "";
  loadAnime(false);
});
loadMoreButton.addEventListener("click", () => {
  if (hasNextPage && !isLoading) loadAnime(true);
});
animeGrid.addEventListener("click", event => {
  const button = event.target.closest("[data-anime-index]");
  if (!button) return;
  const anime = currentAnime[Number(button.dataset.animeIndex)];
  if (anime) openAnimeDetails(anime);
});
function openAnimeDetails(anime) {
  const title = titleOf(anime);
  const image = imageURL(anime);
  const genres = anime.genres || [];
  const description = plainText(anime.description || "No synopsis is available for this title.");
  const studios = anime.studios?.nodes?.map(studio => studio.name) || [];
  const tags = (anime.tags || []).slice(0, 8).map(tag => tag.name);
  animeDetails.innerHTML = `<div class="dialog-layout">
    ${image ? `<img class="dialog-poster" src="${escapeHTML(image)}" alt="${escapeHTML(title)} poster">` : ""}
    <div class="dialog-content">
      <span class="eyebrow">${escapeHTML(anime.format || "ANIME")}</span><h2>${escapeHTML(title)}</h2>
      <div class="dialog-meta">${anime.averageScore ? `<span>★ ${(anime.averageScore / 10).toFixed(1)}</span>` : ""}<span>${escapeHTML(String(anime.episodes ?? "Unknown"))} episodes</span><span>${escapeHTML(anime.status || "Unknown")}</span></div>
      <p>${escapeHTML(description || "No synopsis is available for this title.")}</p>
      <h4>Genres</h4><div class="dialog-meta">${genres.map(g => `<span>${escapeHTML(g)}</span>`).join("")}</div>
      ${studios.length ? `<p><strong>Studios:</strong> ${escapeHTML(studios.join(", "))}</p>` : ""}
      ${tags.length ? `<p><strong>Themes / tags:</strong> ${escapeHTML(tags.join(", "))}</p>` : ""}
      ${anime.siteUrl ? `<a class="dialog-link" href="${escapeHTML(anime.siteUrl)}" target="_blank" rel="noopener noreferrer">Explore full anime page ↗</a>` : ""}
    </div></div>`;
  animeDialog.showModal();
}

// Character search: show matching character profiles, then open the full wiki.
document.getElementById("character-form").addEventListener("submit", async event => {
  event.preventDefault();
  const queryText = document.getElementById("character-search").value.trim();
  if (!queryText) return;
  const thisSearch = ++characterRequestNumber;
  characterResults.innerHTML = '<div class="loading-state">Searching the character universe...</div>';
  const query = `query ($search: String) {
    Page(page: 1, perPage: 8) {
      characters(search: $search, sort: SEARCH_MATCH) {
        id name { full native alternative } image { large }
        siteUrl media(type: ANIME, perPage: 3, sort: POPULARITY_DESC) {
          nodes { title { english romaji } }
        }
      }
    }
  }`;
  try {
    const data = await gql(query, { search: queryText });
    if (thisSearch !== characterRequestNumber) return;
    renderCharacters(data.Page.characters || []);
  } catch (error) {
    if (thisSearch === characterRequestNumber) characterResults.innerHTML = `<div class="error-state">${escapeHTML(error.message)}</div>`;
  }
});
function renderCharacters(list) {
  if (!list.length) {
    characterResults.innerHTML = '<div class="wiki-empty"><span>✧</span><p>No characters found. Try another name.</p></div>';
    return;
  }
  characterResults.innerHTML = list.map(character => {
    const name = character.name?.full || "Unknown character";
    const image = character.image?.large || "";
    const shows = (character.media?.nodes || []).map(item => item.title?.english || item.title?.romaji).filter(Boolean);
    return `<article class="character-result">
      ${image ? `<img src="${escapeHTML(image)}" alt="${escapeHTML(name)}" loading="lazy">` : ""}
      <div class="character-result-info"><h4>${escapeHTML(name)}</h4><p>${escapeHTML(shows.slice(0, 2).join(" · ") || "Anime character")}</p></div>
      <button type="button" data-character-id="${Number(character.id)}">Wiki ↗</button>
    </article>`;
  }).join("");
}
characterResults.addEventListener("click", async event => {
  const button = event.target.closest("[data-character-id]");
  if (!button) return;
  const id = Number(button.dataset.characterId);
  if (!Number.isSafeInteger(id) || id <= 0) return;
  characterDetails.innerHTML = '<div class="loading-state">Opening character wiki...</div>';
  characterDialog.showModal();
  const query = `query ($id: Int) {
    Character(id: $id) {
      id name { full native alternative } image { large }
      description(asHtml: false) siteUrl
      media(type: ANIME, perPage: 10, sort: POPULARITY_DESC) {
        nodes { title { english romaji } siteUrl }
      }
    }
  }`;
  try {
    const data = await gql(query, { id });
    renderCharacterDetails(data.Character);
  } catch (error) {
    characterDetails.innerHTML = `<div class="error-state">${escapeHTML(error.message)}</div>`;
  }
});
function renderCharacterDetails(character) {
  if (!character) {
    characterDetails.innerHTML = '<div class="empty-state">Character profile not found.</div>';
    return;
  }
  const name = character.name?.full || "Character Wiki";
  const image = character.image?.large || "";
  const about = plainText(character.description || "No biography is available for this character.");
  const animeography = (character.media?.nodes || []).map(item => item.title?.english || item.title?.romaji).filter(Boolean);
  const nicknames = character.name?.alternative || [];
  characterDetails.innerHTML = `<div class="character-dialog-layout">
    ${image ? `<img src="${escapeHTML(image)}" alt="${escapeHTML(name)}">` : ""}
    <div><span class="eyebrow">CHARACTER ENCYCLOPEDIA · ANILIST</span><h2>${escapeHTML(name)}</h2>
      ${character.name?.native ? `<p>${escapeHTML(character.name.native)}</p>` : ""}
      ${nicknames.length ? `<div class="dialog-meta">${nicknames.map(n => `<span>${escapeHTML(n)}</span>`).join("")}</div>` : ""}
      <p>${escapeHTML(about || "No biography is available for this character.")}</p>
      ${animeography.length ? `<h3>Anime Appearances</h3><div class="character-appearances">${animeography.map(title => `<span>${escapeHTML(title)}</span>`).join("")}</div>` : ""}
      ${character.siteUrl ? `<a class="dialog-link" href="${escapeHTML(character.siteUrl)}" target="_blank" rel="noopener noreferrer">View full character page ↗</a>` : ""}
    </div></div>`;
}
document.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", () => button.closest("dialog").close()));
document.querySelectorAll(".details-dialog").forEach(dialog => dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); }));
loadAnime(false);
