import React, { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import Fuse from "fuse.js";
import { ChevronRight, Globe, Phone, Mail, MapPin, ExternalLink, Clock } from "lucide-react";

// Google Sheet CSV (portal_data tab). Replace PORTAL_GID_HERE with the gid of the portal_data sheet.
const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1f6hQNKdqnth8BIATF8UR2TZ-TUWRPCitBCrTLTDeL1g/export?format=csv&gid=1694382803";

// Optional: drop brand logos into /public and set their paths here
const LOGO_LIGHT = "/qdn_logo.png";      // dark text logo for light mode (optional)
const LOGO_DARK  = "/quad_logo_highreswhite.png"; // white logo for dark headers (optional)
const ACCENT = "#E31C79"; // Quadranet pink (from logo)

// Fallback proxies – handy for local preview environments that block cross-origin fetches.
const CORS_PROXIES = [
  (u) => `https://r.jina.ai/http/${u.replace(/^https?:\/\//, "")}`,
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
];

const clean = (v) => {
  const s = (v ?? "").toString().trim();
  if (!s) return "";
  const bad = new Set(["#ERROR!", "#N/A", "N/A", "NULL", "UNDEFINED"]);
  return bad.has(s.toUpperCase()) ? "" : s;
};

const toAbsUrl = (base, src) => {
  try {
    return new URL(src, base).toString();
  } catch {
    return src;
  }
};

const normaliseKey = (k) => k?.toString().trim().toLowerCase().replace(/\s+/g, "_") ?? "";

// Map legacy headers to canonical keys we use in the UI
const KEY_ALIAS = {
  "brand name": "brand_name",
  "official website": "website_url",
  "website url": "website_url",
  "maps url": "maps_url",
  "widget url (canonical)": "booking_widget_url",
  "iframe url": "booking_widget_url",
  "view url": "booking_widget_url",
  "logo url": "logo_url_full",
  "area__town__city": "area_town_city",
  "search_tags": "tags",
  "region/country": "region",
};

const getValFromRow = (row, key) => {
  const nk = normaliseKey(key);
  const direct = row[nk];
  if (direct) return clean(direct);
  const alias = KEY_ALIAS[nk];
  if (alias) return clean(row[normaliseKey(alias)] || "");
  return "";
};

// Helper: get area/town/city from a row, respecting aliases
const getCityFromRow = (row) => {
  return clean(
    getValFromRow(row, "area_town_city") ||
    getValFromRow(row, "area/town/city") ||
    getValFromRow(row, "Area/Town/City") ||
    getValFromRow(row, "area__town__city") ||
    ""
  );
};

function useSheetData(url) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");

      const tryUrls = [url, ...CORS_PROXIES.map((fn) => fn(url))];
      let lastErr = null;

      for (const u of tryUrls) {
        try {
          const res = await fetch(u, { cache: "no-store" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const text = await res.text();
          const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
          const out = parsed.data.map((r) => {
            const obj = {};
            Object.entries(r).forEach(([k, v]) => (obj[normaliseKey(k)] = (v ?? "").toString().trim()));
            return obj;
          });
          if (!cancelled) {
            setRows(out);
            setLoading(false);
          }
          return;
        } catch (e) {
          lastErr = e;
        }
      }
      if (!cancelled) {
        setError(`Could not load sheet. ${lastErr ? lastErr.message : ""}`);
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [url]);

  return { rows, loading, error };
}

export default function App() {
  const { rows, loading, error } = useSheetData(SHEET_CSV_URL);
  const [q, setQ] = useState("");
  const [city, setCity] = useState("all");

  const fuse = useMemo(() => {
    const keys = [
      "brand_name",
      "slug",
      "area_town_city",
      "location_address",
      "website_url",
      "tags",
      "extra_tags",
      "cuisine",
      "opening_hours",
      "region",
    ].map(normaliseKey);
    return new Fuse(rows, { keys, threshold: 0.35, includeScore: true, ignoreLocation: true });
  }, [rows]);

  const areas = useMemo(() => {
    const set = new Set(
      rows
        .map((r) => getCityFromRow(r))
        .filter(Boolean)
        .map((s) => s.trim())
    );
    return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [rows]);

  const list = useMemo(() => {
    let l = rows;
    if (q.trim()) l = fuse.search(q).map((x) => x.item);
    if (city !== "all") {
      l = l.filter((r) => {
        const c = (getCityFromRow(r) || "").toLowerCase();
        return c === city.toLowerCase();
      });
    }
    return l;
  }, [rows, q, city, fuse]);

  return (
    <div style={{ minHeight: "100vh", background: "#f6f7f9" }}>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          backdropFilter: "saturate(180%) blur(6px)",
          background: "#ffffff",
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "12px 16px",
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Logo (optional) */}
            <img src={LOGO_LIGHT} alt="Quadranet" style={{ height: 28, width: "auto" }} onError={(e)=>{e.currentTarget.style.display='none';}} />
            <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Quadranet Booking Portal (MVP)</h1>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              placeholder="Search by name, place, tag…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, width: 320 }}
            />
            <select
              value={city}
              onChange={(e) => setCity(e.target.value)}
              style={{ padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6 }}
            >
              {areas.map((a) => (
                <option key={a} value={a}>
                  {a === "all" ? "All areas" : a}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <main style={{ width: "100%", boxSizing: "border-box" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: 16 }}>
          {loading && <p style={{ color: "#4b5563" }}>Loading venues…</p>}
          {error && <p style={{ color: "#b91c1c" }}>{error}</p>}

          {!loading && !error && (
            <div
              style={{
                display: "grid",
                gap: 20,
                gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                alignItems: "start",
                justifyItems: "stretch",
              }}
            >
              {list.map((v, i) => (
                <VenueCard key={i} v={v} />
              ))}
            </div>
          )}

          {!loading && !error && list.length === 0 && (
            <p style={{ color: "#6b7280" }}>No matches. Try a broader search.</p>
          )}
        </div>
      </main>
    </div>
  );
}

function VenueCard({ v }) {
  const [logoOk, setLogoOk] = useState(true);
  const g = (k) => getValFromRow(v, k);
  const brand = g("brand_name") || g("Brand Name") || g("slug") || "Unknown";
  const widget = g("booking_widget_url") || g("Widget URL (canonical)") || g("iFrame URL") || g("View URL");
  const logoFull = g("logo_url_full");
  const favicon = g("favicon_url");
  const address = g("location_address") || g("Address");
  const website = g("website_url") || g("Official Website") || g("Website URL");
  const menu = g("menu_url");
  const maps = g("maps_url") || g("Maps URL");
  const city = g("area_town_city") || g("area__town__city");
  const cuisine = g("cuisine");
  const opening = g("opening_hours") || g("Opening Hours");
  const tagsRaw = g("tags") || g("search_tags") || g("Tags");
  const tags = tagsRaw ? tagsRaw.split(/[,|]/).map((t) => t.trim()).filter(Boolean) : [];
  const tripadvisor = g("tripadvisor_url");

  const card = {
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    overflow: "hidden",
    background: "#fff",
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  };

  const top = {
    height: 160,            // fixed well height to keep cards consistent
    background: "#ffffff",
    borderBottom: "1px solid #f1f5f9",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    padding: 12,
  };

  const btn = {
    background: ACCENT,
    color: "#fff",
    padding: "8px 12px",
    borderRadius: 8,
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
  };

  return (
    <div style={card}>
      <div style={top}>
        {logoFull && logoOk ? (
          <img
            src={logoFull}
            alt={`${brand} logo`}
            style={{ maxWidth: "90%", maxHeight: "90%", width: "auto", height: "auto", objectFit: "contain", display: "block", background: "#fff", boxShadow: "0 0 0 1px rgba(0,0,0,0.04)" }}
            loading="lazy"
            onError={() => setLogoOk(false)}
          />
        ) : favicon ? (
          <img
            src={favicon}
            alt={`${brand} icon`}
            style={{ width: 64, height: 64, objectFit: "contain", display: "block", opacity: 0.9 }}
            loading="lazy"
          />
        ) : (
          <div style={{ color: "#9ca3af", fontSize: 12 }}>No logo</div>
        )}
      </div>

      <div style={{ padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{brand}</h2>
            {cuisine && (
              <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>{cuisine}</div>
            )}
          </div>
          {city && (
            <span style={{ fontSize: 12, padding: "2px 8px", border: "1px solid #e5e7eb", borderRadius: 12, color: "#374151", whiteSpace: "nowrap" }}>
              {city}
            </span>
          )}
        </div>

        {address && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 14, color: "#4b5563", marginTop: 8 }}>
            <MapPin size={16} /> <span>{address}</span>
          </div>
        )}
        {opening && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#6b7280", marginTop: 6 }}>
            <Clock size={16} /> <span>{opening}</span>
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 14, color: "#374151", marginTop: 8 }}>
          {website && (
            <a href={website} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
              <Globe size={16} /> Website <ExternalLink size={14} />
            </a>
          )}
          {menu && (
            <a href={menu} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
              Menu <ExternalLink size={14} />
            </a>
          )}
          {maps && (
            <a href={maps} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
              Map <ExternalLink size={14} />
            </a>
          )}
          {tripadvisor && (
            <a href={tripadvisor} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
              Tripadvisor <ExternalLink size={14} />
            </a>
          )}
        </div>

        {tags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {tags.map((t, idx) => (
              <span
                key={idx}
                style={{
                  fontSize: 12,
                  padding: "2px 8px",
                  borderRadius: 999,
                  border: "1px solid #f2c2d7",
                  background: "#fff0f6",
                  color: "#7a2448",
                }}
              >
                {t}
              </span>
            ))}
          </div>
        )}
        {false && (
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>{/* other */}</div>
        )}

        <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {widget ? (
            <a href={widget} target="_blank" rel="noreferrer" style={btn}>
              Book now <ChevronRight size={16} />
            </a>
          ) : (
            <span style={{ fontSize: 12, color: "#9ca3af" }}>No widget URL</span>
          )}
        </div>
      </div>
    </div>
  );
}