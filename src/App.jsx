import React, { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import Fuse from "fuse.js";
import { ChevronRight, Globe, Phone, Mail, MapPin, ExternalLink } from "lucide-react";

// Your published Google Sheet CSV
const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1f6hQNKdqnth8BIATF8UR2TZ-TUWRPCitBCrTLTDeL1g/export?format=csv&gid=0";

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

const normaliseKey = (k) => k?.toString().trim().toLowerCase().replace(/\s+/g, "_") ?? "";

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
  const [region, setRegion] = useState("all");

  const fuse = useMemo(() => {
    const keys = ["brand_name", "slug", "address", "region/country", "region", "menu_url", "official_website"].map(
      normaliseKey
    );
    return new Fuse(rows, { keys, threshold: 0.35, includeScore: true, ignoreLocation: true });
  }, [rows]);

  const regions = useMemo(() => {
    const set = new Set(
      rows.map((r) => r[normaliseKey("Region/Country")] || r[normaliseKey("Region")] || "").filter(Boolean)
    );
    return ["all", ...Array.from(set).sort()];
  }, [rows]);

  const list = useMemo(() => {
    let l = rows;
    if (q.trim()) l = fuse.search(q).map((x) => x.item);
    if (region !== "all") {
      l = l.filter((r) => {
        const rc = r[normaliseKey("Region/Country")] || r[normaliseKey("Region")] || "";
        return rc.toLowerCase() === region.toLowerCase();
      });
    }
    return l;
  }, [rows, q, region, fuse]);

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
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "12px 16px", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Quadranet Booking Widgets • Portal (MVP)</h1>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              placeholder="Search by name, place, tag…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6, width: 320 }}
            />
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              style={{ padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 6 }}
            >
              {regions.map((r) => (
                <option key={r} value={r}>
                  {r === "all" ? "All regions" : r}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "16px" }}>
        {loading && <p style={{ color: "#4b5563" }}>Loading venues…</p>}
        {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
        {!loading && !error && (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div style={{
              display: "grid",
              gap: 16,
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              alignItems: "start",
              justifyItems: "stretch",
              width: "100%",
              maxWidth: 1200,
              margin: "0 auto",
            }}>
              {list.map((v, i) => (
                <VenueCard key={i} v={v} />
              ))}
            </div>
          </div>
        )}
        {!loading && !error && list.length === 0 && <p style={{ color: "#6b7280" }}>No matches. Try a broader search.</p>}
      </main>
    </div>
  );
}

function VenueCard({ v }) {
  const [logoOk, setLogoOk] = useState(true);
  const g = (k) => clean(v[normaliseKey(k)] || "");
  const brand = g("Brand Name") || g("brand_name");
  const widget = g("Widget URL (canonical)") || g("iFrame URL") || g("View URL");
  const logo = g("Logo URL");
  const address = g("Address");
  const phone = g("Phone");
  const email = g("Email");
  const website = g("Official Website") || g("Website URL");
  const menu = g("Menu URL");
  const maps = g("Maps URL");
  const region = g("Region/Country") || g("Region");
  const confidence = g("Confidence");

  const card = {
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    overflow: "hidden",
    background: "#fff",
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  };

  const top = {
    height: 120,
    background: "#f3f4f6",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  };

  const btn = {
    background: "#111827",
    color: "#fff",
    padding: "8px 12px",
    borderRadius: 8,
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  };

  return (
    <div style={card}>
      <div style={top}>
        {logo && logoOk ? (
          // eslint-disable-next-line jsx-a11y/img-redundant-alt
          <img
            src={logo}
            alt={`${brand} logo`}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
            loading="lazy"
            onError={() => setLogoOk(false)}
          />
        ) : (
          <div style={{ color: "#9ca3af", fontSize: 12 }}>No logo</div>
        )}
      </div>

      <div style={{ padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{brand}</h2>
          {region && (
            <span style={{ fontSize: 12, padding: "2px 8px", border: "1px solid #e5e7eb", borderRadius: 12, color: "#374151" }}>
              {region}
            </span>
          )}
        </div>

        {address && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 14, color: "#4b5563", marginTop: 8 }}>
            <MapPin size={16} /> <span>{address}</span>
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 14, color: "#374151", marginTop: 8 }}>
          {phone && (
            <a href={`tel:${phone.replace(/\s+/g, "")}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
              <Phone size={16} /> {phone}
            </a>
          )}
          {email && (
            <a href={`mailto:${email}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
              <Mail size={16} /> Email
            </a>
          )}
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
        </div>

        <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          {widget ? (
            <a href={widget} target="_blank" rel="noreferrer" style={btn}>
              Book now <ChevronRight size={16} />
            </a>
          ) : (
            <span style={{ fontSize: 12, color: "#9ca3af" }}>No widget URL</span>
          )}
          {confidence && <span style={{ fontSize: 12, color: "#6b7280" }}>{confidence}</span>}
        </div>
      </div>
    </div>
  );
}