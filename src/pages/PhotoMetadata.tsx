// @ts-nocheck - TODO: Add proper TypeScript types
import React, { useState, useEffect, useCallback } from 'react';
import './codegen.css';
import { escapeXml, copyToClipboard, downloadTextFile, getTodayISO } from '../utils/helpers';
import { searchClubs, fetchClubProfile } from '../services/api';
import toast, { Toaster } from 'react-hot-toast';

export default function PhotoMetadata() {
  const [meta, setMeta] = useState({
    objectName: '', // Title
    headline: '',
    description: '', // Caption/Description
    byline: '', // Author
    credit: '',
    copyright: '',
    jobId: '',
    keywords: '', // comma separated
    dateCreated: '', // YYYY-MM-DD
    city: '',
    state: '',
    country: '',
    source: '',
    stadium: '',
  });

  const handleChange = (field) => (e) => setMeta({ ...meta, [field]: e.target.value });

  const asJSON = () => JSON.stringify({ ...meta, keywords: meta.keywords.split(',').map(k => k.trim()).filter(Boolean) }, null, 2);

  const handleCopy = async () => {
    const success = await copyToClipboard(asJSON());
    if (success) {
      toast.success('Metadata JSON copied to clipboard');
    } else {
      toast.error('Copy failed');
    }
  };

  const generateXMP = (m) => {
    const keywords = (m.keywords || '')
      .split(',')
      .map(k => k.trim())
      .filter(Boolean);

    const title = escapeXml(m.objectName);
    const headline = escapeXml(m.headline);
    const desc = escapeXml(m.description);
    const byline = escapeXml(m.byline);
    const credit = escapeXml(m.credit);
    const jobId = escapeXml(m.jobId);
    const copyright = escapeXml(m.copyright);
    const dateCreated = escapeXml(m.dateCreated);
    const city = escapeXml(m.city);
    const state = escapeXml(m.state);
    const country = escapeXml(m.country);
    const source = escapeXml(m.source);
    const stadium = escapeXml(m.stadium);
    const event = headline || title;

    const keywordNodes = keywords.map(k => `            <rdf:li>${escapeXml(k)}</rdf:li>`).join('\n');

    // eslint-disable-next-line no-useless-escape
    return `<?xpacket begin=\"\uFEFF\" id=\"W5M0MpCehiHzreSzNTczkc9d\"?>\n<x:xmpmeta xmlns:x=\"adobe:ns:meta/\">\n  <rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\"\n           xmlns:dc=\"http://purl.org/dc/elements/1.1/\"\n           xmlns:photoshop=\"http://ns.adobe.com/photoshop/1.0/\"\n           xmlns:xmp=\"http://ns.adobe.com/xap/1.0/\"\n           xmlns:Iptc4xmpCore=\"http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/\"\n           xmlns:Iptc4xmpExt=\"http://iptc.org/std/Iptc4xmpExt/2008-02-29/\">\n    <rdf:Description rdf:about=\"\"\n     Iptc4xmpCore:Location=\"${stadium}\">\n      <dc:title>\n        <rdf:Alt>\n          <rdf:li xml:lang=\"x-default\">${title}</rdf:li>\n        </rdf:Alt>\n      </dc:title>\n      <dc:creator>\n        <rdf:Seq>\n          <rdf:li>${byline}</rdf:li>\n        </rdf:Seq>\n      </dc:creator>\n      <dc:rights>\n        <rdf:Alt>\n          <rdf:li xml:lang=\"x-default\">${copyright}</rdf:li>\n        </rdf:Alt>\n      </dc:rights>\n      <photoshop:City>${city}</photoshop:City>\n      <photoshop:State>${state}</photoshop:State>\n      <photoshop:Country>${country}</photoshop:Country>\n      <photoshop:Credit>${credit}</photoshop:Credit>\n      <photoshop:Source>${source}</photoshop:Source>\n      <photoshop:DateCreated>${dateCreated}</photoshop:DateCreated>\n      <photoshop:Headline>${headline}</photoshop:Headline>\n      <photoshop:TransmissionReference>${jobId}</photoshop:TransmissionReference>\n      <dc:description>\n        <rdf:Alt>\n          <rdf:li xml:lang=\"x-default\">${desc}</rdf:li>\n        </rdf:Alt>\n      </dc:description>\n      <dc:subject>\n        <rdf:Bag>\n${keywordNodes}\n        </rdf:Bag>\n      </dc:subject>\n      <Iptc4xmpCore:DateCreated>${dateCreated}</Iptc4xmpCore:DateCreated>\n      <Iptc4xmpCore:Credit>${credit}</Iptc4xmpCore:Credit>\n      <Iptc4xmpCore:CopyrightNotice>${copyright}</Iptc4xmpCore:CopyrightNotice>\n      <Iptc4xmpCore:Source>${source}</Iptc4xmpCore:Source>\n      <Iptc4xmpCore:Headline>${headline}</Iptc4xmpCore:Headline>\n      <Iptc4xmpCore:JobID>${jobId}</Iptc4xmpCore:JobID>\n      <Iptc4xmpCore:OriginalTransmissionReference>${jobId}</Iptc4xmpCore:OriginalTransmissionReference>\n      <Iptc4xmpExt:Event>\n        <rdf:Alt>\n          <rdf:li xml:lang=\"x-default\">${event}</rdf:li>\n        </rdf:Alt>\n      </Iptc4xmpExt:Event>\n    </rdf:Description>\n  </rdf:RDF>\n</x:xmpmeta>\n<?xpacket end=\"w\"?>`;
  };

  const handleDownload = () => {
    const xmp = generateXMP(meta);
    downloadTextFile(xmp, `${meta.dateCreated ? meta.dateCreated + '-' : ''}${meta.objectName || 'photo-metadata'}.xmp`, 'application/xml');
  };

  // Club search states (hidden behind dropdown)
  const [showClubSearch, setShowClubSearch] = useState(true);
  const [homeSearchTerm, setHomeSearchTerm] = useState('');
  const [awaySearchTerm, setAwaySearchTerm] = useState('');
  const [homeResults, setHomeResults] = useState([]);
  const [awayResults, setAwayResults] = useState([]);
  const [searchingHome, setSearchingHome] = useState(false);
  const [searchingAway, setSearchingAway] = useState(false);
  const [selectedHomeClub, setSelectedHomeClub] = useState(null);
  const [selectedAwayClub, setSelectedAwayClub] = useState(null);
  const [checkToday, setCheckToday] = useState(false);

  const handleClubSearch = async (term, setResults, setSearching) => {
    if (!term) {
      return;
    }
    try {
      setSearching(true);
      setResults([]);
      const data = await searchClubs(term);
      setResults(data.results.map((t) => ({ id: t.id, name: t.name, country: t.country })));
    } catch (e) {
      console.error('Club search failed', e);
      setResults([]);
      toast.error('Club search failed');
    } finally {
      setSearching(false);
    }
  };

  // Persisted Creator & Rights (byline, credit, copyright, source)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('photo_meta_creator_rights');
      if (saved) {
        const obj = JSON.parse(saved);
        setMeta(prev => ({
          ...prev,
          byline: obj.byline || '',
          credit: obj.credit || '',
          copyright: obj.copyright || '',
          source: obj.source || '',
        }));
      }
    } catch (e) {
      // ignore
    }
  }, []);

  // keep checkToday in sync with dateCreated
  useEffect(() => {
    const today = getTodayISO();
    setCheckToday(Boolean(meta.dateCreated && meta.dateCreated === today));
  }, [meta.dateCreated]);

  const saveCreatorRights = () => {
    const payload = {
      byline: meta.byline || '',
      credit: meta.credit || '',
      copyright: meta.copyright || '',
      source: meta.source || '',
    };
    try {
      localStorage.setItem('photo_meta_creator_rights', JSON.stringify(payload));
      toast.success('Creator & Rights saved');
    } catch (e) {
      toast.error('Failed to save Creator & Rights');
    }
  };

  const clearSavedCreatorRights = () => {
    try {
      localStorage.removeItem('photo_meta_creator_rights');
    } catch (e) {
      // ignore
    }
    setMeta(prev => ({ ...prev, byline: '', credit: '', copyright: '', source: '' }));
    toast.success('Saved Creator & Rights cleared');
  };

  const applyClubToMeta = useCallback(async () => {
    // Build headline/title/description from selected home/away clubs using profile data when available
    if (!selectedHomeClub && !selectedAwayClub) {
      return;
    }

    const homeProfile = selectedHomeClub ? await fetchClubProfile(selectedHomeClub.id).catch(() => null) : null;

    const homeName = selectedHomeClub?.name || (homeProfile && homeProfile.name) || '';
    const awayName = selectedAwayClub?.name || '';

    const stadium = (homeProfile && (homeProfile.stadiumName)) || '';

    const title = homeName && awayName ? `${homeName} vs ${awayName}` : (homeName || awayName || 'Match');
    const description = `during the {COMPETITION} match between ${homeName || 'Home Team'} and ${awayName || 'Away Team'}${stadium ? ' at ' + stadium : ''}.`;
    
    // Convert YYYY-MM-DD to DD/MM/YYYY for headline
    const formatDate = (dateStr) => {
      if (!dateStr) {
        return '';
      }
      const [year, month, day] = dateStr.split('-');
      return `${day}/${month}/${year}`;
    };
    
    setMeta((prev) => ({
      ...prev,
      objectName: title,
      headline: `${formatDate(prev.dateCreated)} - ${homeName || 'Home Team'} -v- ${awayName || 'Away Team'}`,
      description: description,
      country: country || prev.country,
      stadium: stadium || prev.stadium,
	  keywords: (() => {
        const existingKeywords = prev.keywords ? prev.keywords.split(',').map(k => k.trim()) : [];
        const newKeywords = [homeName, awayName, stadium, country].filter(Boolean);
        const allKeywords = [...existingKeywords];
        newKeywords.forEach(kw => {
          if (!allKeywords.some(existing => existing.toLowerCase() === kw.toLowerCase())) {
            allKeywords.push(kw);
          }
        });
        return allKeywords.join(', ');
      })(),
    }));
  }, [selectedHomeClub, selectedAwayClub]);

  // Auto-apply club metadata when selections change
  useEffect(() => {
    if (selectedHomeClub || selectedAwayClub) {
      applyClubToMeta();
    }
  }, [selectedHomeClub, selectedAwayClub, applyClubToMeta]);

  useEffect(() => {
    if ((selectedHomeClub || selectedAwayClub) && meta.dateCreated) {
      const formatDate = (dateStr) => {
        if (!dateStr) {
          return '';
        }
        const [year, month, day] = dateStr.split('-');
        return `${day}/${month}/${year}`;
      };
      
      const homeName = selectedHomeClub?.name || '';
      const awayName = selectedAwayClub?.name || '';
      
      setMeta((prev) => ({
        ...prev,
        headline: `${formatDate(prev.dateCreated)} - ${homeName || 'Home Team'} -v- ${awayName || 'Away Team'}`,
      }));
    }
  }, [meta.dateCreated, selectedHomeClub, selectedAwayClub]);

  return (
  <div className="generated-code-page container-page">
    <Toaster position="top-right" />
    <div className="card generated-code-card">
    <div className="card-header">
      <div>
      <div className="card-title">Photo metadata (IPTC/XMP)</div>
      <div className="card-subtitle">
        Build IPTC fields for Photo Mechanic and export as XMP.
      </div>
      </div>
      <span className="pill">Club-aware · Job ID · Fixture today</span>
    </div>

    <div className="stack-md" style={{ marginBottom: 10 }}>
      <p className="muted" style={{ margin: 0 }}>
      Keywords should be comma-separated. Creator & rights can be saved for reuse across sessions.
      </p>
      <div className="generated-inline-row" style={{ justifyContent: 'flex-end' }}>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => setShowClubSearch((s) => !s)}
      >
        {showClubSearch ? 'Hide club search' : 'Use club search'}
      </button>
      </div>
    </div>

    {showClubSearch && (
      <div className="generated-grid" style={{ marginBottom: 18 }}>
      <div className="generated-column card" style={{ padding: 14 }}>
        <div className="generated-section-title">Home club</div>
        <label className="field-label">Search</label>
        <div className="generated-inline-row">
        <input
          className="input"
          value={homeSearchTerm}
          onChange={(e) => setHomeSearchTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && homeSearchTerm && !searchingHome) {
              handleClubSearch(homeSearchTerm, setHomeResults, setSearchingHome);
            }
          }}
          placeholder="e.g. Celtic"
        />
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => handleClubSearch(homeSearchTerm, setHomeResults, setSearchingHome)}
          disabled={searchingHome}
        >
          {searchingHome ? 'Searching…' : 'Search'}
        </button>
        </div>
        {homeResults.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <label className="field-label">Results</label>
          <select
          className="select"
          value={selectedHomeClub?.id || ''}
          title="Select home club"
          aria-label="Select home club"
          onChange={(e) => {
            const sel = homeResults.find((r) => r.id === e.target.value);
            setSelectedHomeClub(sel || null);
          }}
          >
          <option value="">-- Select home club --</option>
          {homeResults.map((r) => (
            <option key={r.id} value={r.id}>
            {r.name} {r.country ? `- ${r.country}` : ''}
            </option>
          ))}
          </select>
        </div>
        )}
      </div>

      <div className="generated-column card" style={{ padding: 14 }}>
        <div className="generated-section-title">Away club</div>
        <label className="field-label">Search</label>
        <div className="generated-inline-row">
        <input
          className="input"
          value={awaySearchTerm}
          onChange={(e) => setAwaySearchTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && awaySearchTerm && !searchingAway) {
              handleClubSearch(awaySearchTerm, setAwayResults, setSearchingAway);
            }
          }}
          placeholder="e.g. Bohemians"
        />
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => handleClubSearch(awaySearchTerm, setAwayResults, setSearchingAway)}
          disabled={searchingAway}
        >
          {searchingAway ? 'Searching…' : 'Search'}
        </button>
        </div>
        {awayResults.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <label className="field-label">Results</label>
          <select
          className="select"
          value={selectedAwayClub?.id || ''}
          title="Select away club"
          aria-label="Select away club"
          onChange={(e) => {
            const sel = awayResults.find((r) => r.id === e.target.value);
            setSelectedAwayClub(sel || null);
          }}
          >
          <option value="">-- Select away club --</option>
          {awayResults.map((r) => (
            <option key={r.id} value={r.id}>
            {r.name} {r.country ? `- ${r.country}` : ''}
            </option>
          ))}
          </select>
        </div>
        )}
      </div>
      </div>
    )}

    <div className="grid-2">
      <div className="card" style={{ padding: 14 }}>
      <div className="generated-section-title">Core</div>
      <label className="field-label">Title (Object Name)</label>
      <input className="input" value={meta.objectName} onChange={handleChange('objectName')} title="Title" placeholder="Photo title" />
      <label className="field-label" style={{ marginTop: 10 }}>Headline</label>
      <input className="input" value={meta.headline} onChange={handleChange('headline')} title="Headline" placeholder="Photo headline" />
      <label className="field-label" style={{ marginTop: 10 }}>Description / Caption</label>
      <textarea
        className="textarea"
        style={{ minHeight: 120, maxHeight: 160 }}
        value={meta.description}
        onChange={handleChange('description')}
        title="Description"
        placeholder="Photo description or caption"
      />
      </div>

      <div className="card" style={{ padding: 14 }}>
      <div className="generated-section-title">Creator & rights</div>
      <label className="field-label">Byline (Author)</label>
      <input className="input" value={meta.byline} onChange={handleChange('byline')} title="Byline" placeholder="Author name" />
      <label className="field-label" style={{ marginTop: 10 }}>Credit</label>
      <input className="input" value={meta.credit} onChange={handleChange('credit')} title="Credit" placeholder="Photo credit" />
      <label className="field-label" style={{ marginTop: 10 }}>Job ID</label>
      <input className="input" value={meta.jobId} onChange={handleChange('jobId')} title="Job ID" placeholder="Job identifier" />
      <label className="field-label" style={{ marginTop: 10 }}>Copyright Author</label>
      <input className="input" value={meta.copyright} onChange={handleChange('copyright')} title="Copyright" placeholder="Copyright holder" />
      <label className="field-label" style={{ marginTop: 10 }}>Source</label>
      <input className="input" value={meta.source} onChange={handleChange('source')} title="Source" placeholder="Photo source" />
      <div className="btn-row" style={{ marginTop: 10 }}>
        <button type="button" className="btn btn-secondary" onClick={saveCreatorRights}>
        Save creator/rights
        </button>
        <button type="button" className="btn btn-ghost" onClick={clearSavedCreatorRights}>
        Clear saved
        </button>
      </div>
      </div>
    </div>

    <div className="grid-2" style={{ marginTop: 16 }}>
      <div className="card" style={{ padding: 14 }}>
      <div className="generated-section-title">Location & date</div>
      <label className="field-label">Stadium</label>
      <input className="input" value={meta.stadium} onChange={handleChange('stadium')} title="Stadium" placeholder="Stadium name" />
      <label className="field-label" style={{ marginTop: 10 }}>City</label>
      <input className="input" value={meta.city} onChange={handleChange('city')} title="City" placeholder="City name" />
      <label className="field-label" style={{ marginTop: 10 }}>State / Province</label>
      <input className="input" value={meta.state} onChange={handleChange('state')} title="State" placeholder="State or province" />
      <label className="field-label" style={{ marginTop: 10 }}>Country</label>
      <input className="input" value={meta.country} onChange={handleChange('country')} title="Country" placeholder="Country name" />
      <label className="field-label" style={{ marginTop: 10 }}>Date</label>
      <div className="generated-inline-row" style={{ alignItems: 'center' }}>
        <input
        className="input"
        type="date"
        value={meta.dateCreated}
        title="Date created"
        onChange={(e) => {
          handleChange('dateCreated')(e);
          const val = e.target.value;
          setCheckToday(Boolean(val && val === getTodayISO()));
        }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, whiteSpace: 'nowrap' }}>
        <input
          type="checkbox"
          checked={checkToday}
          onChange={(e) => {
          const on = e.target.checked;
          setCheckToday(on);
          if (on) {
            setMeta((prev) => ({ ...prev, dateCreated: getTodayISO() }));
          } else {
            setMeta((prev) => ({ ...prev, dateCreated: '' }));
          }
          }}
        />
        Fixture today
        </label>
      </div>
      </div>
      <div className="card" style={{ padding: 14 }}>
      <div className="generated-section-title">Keywords</div>
      <label className="field-label">Keywords (comma separated)</label>
      <textarea
        className="textarea"
        style={{ minHeight: 170, maxHeight: 210 }}
        value={meta.keywords}
        onChange={handleChange('keywords')}
        title="Keywords"
        placeholder="keyword1, keyword2, keyword3"
      />
      </div>
    </div>

    <div className="btn-row">
      <button type="button" className="btn" onClick={handleCopy}>
      Copy JSON
      </button>
      <button
      type="button"
      className="btn btn-secondary"
      onClick={() => {
        const xmpToCopy = generateXMP(meta);
        navigator.clipboard && navigator.clipboard.writeText(xmpToCopy);
        toast.success('XMP copied to clipboard');
      }}
      >
      Copy XMP
      </button>
      <button type="button" className="btn" onClick={handleDownload}>
      Download XMP
      </button>
      <button
      type="button"
      className="btn btn-ghost"
      onClick={() => {
        setMeta({
        objectName: '',
        headline: '',
        description: '',
        byline: '',
        credit: '',
        copyright: '',
        jobId: '',
        keywords: '',
        dateCreated: '',
        city: '',
        state: '',
        country: '',
        source: '',
        stadium: '',
        });
      }}
      >
      Clear
      </button>
    </div>

    <div className="preview-block">
      <div className="preview-heading">
      <span>Preview (JSON)</span>
      </div>
      <pre className="preview-body">{asJSON()}</pre>
    </div>
    </div>
  </div>
  );
}