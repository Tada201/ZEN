import { useEffect, useState } from 'react';
import { Check, Loader2, Map, PlugZap, RotateCw, ShieldCheck } from 'lucide-react';
import { settingsApi, isSecretPresentValue } from '@/api/settingsApi';
import { gtsmApi } from '@/api/gtsmApi';

type SecretKey = 'google_maps_api_key' | 'here_api_key' | 'maps_camera_catalog_token';

const integrations = [
  { name: 'Open-Meteo weather', detail: 'Current weather grid provider. No key required.', state: 'Built in' },
  { name: 'NASA EONET', detail: 'Natural-event feed. No key required.', state: 'Built in' },
  { name: 'USGS earthquakes', detail: 'Earthquake feed. No key required.', state: 'Built in' },
] as const;

function SecretField({ label, detail, value, present, onChange, onClear }: { label: string; detail: string; value: string; present: boolean; onChange: (value: string) => void; onClear: () => void }) {
  return <div className="border border-border bg-muted/30 p-3">
    <div className="flex items-start justify-between gap-3"><div><p className="text-[12px] font-medium text-foreground">{label}</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{detail}</p></div>{present ? <span className="flex shrink-0 items-center gap-1 text-[10px] text-success"><Check size={12} /> Saved</span> : <span className="text-[10px] text-muted-foreground">Not set</span>}</div>
    <div className="mt-3 flex gap-2"><input type="password" autoComplete="off" value={value} onChange={(event) => onChange(event.target.value)} placeholder={present ? 'Enter a replacement value' : 'Paste key'} className="h-8 min-w-0 flex-1 border border-border bg-background/30 px-2 text-[11px] text-foreground outline-none focus:border-primary/60" />{present ? <button type="button" onClick={onClear} className="border border-rose-400/30 px-2 text-[10px] text-rose-200 hover:bg-rose-400/10">Clear</button> : null}</div>
  </div>;
}

export function MapConfiguration() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [googleKey, setGoogleKey] = useState('');
  const [hereKey, setHereKey] = useState('');
  const [catalogUrl, setCatalogUrl] = useState('');
  const [catalogToken, setCatalogToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const next = await settingsApi.getAllSettings();
      setSettings(next);
      setCatalogUrl(next['maps.camera_catalog_url'] ?? '');
    } catch {
      setNotice('Map settings could not be loaded.');
    } finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); }, []);

  const hasSecret = (key: SecretKey) => isSecretPresentValue(settings[key]);
  const clearSecret = async (key: SecretKey) => {
    await settingsApi.setSetting(key, '');
    await refresh();
    setNotice(`${key.replaceAll('_', ' ')} cleared.`);
  };

  const save = async () => {
    setSaving(true); setNotice(null);
    try {
      await settingsApi.setSettings({ 'maps.camera_catalog_url': catalogUrl.trim() });
      if (googleKey) await settingsApi.setSetting('google_maps_api_key', googleKey);
      if (hereKey) await settingsApi.setSetting('here_api_key', hereKey);
      if (catalogToken) await settingsApi.setSetting('maps_camera_catalog_token', catalogToken);
      setGoogleKey(''); setHereKey(''); setCatalogToken('');
      await refresh();
      setNotice('Map connections saved.');
    } catch {
      setNotice('Map connections could not be saved.');
    } finally { setSaving(false); }
  };

  const testCatalog = async () => {
    setTesting(true); setNotice(null);
    try { setNotice(`Camera catalog reachable: ${await gtsmApi.testMapCameraCatalog()} entries.`); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Camera catalog test failed.'); }
    finally { setTesting(false); }
  };

  if (loading) return <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 animate-spin" size={16} /> Loading map settings</div>;

  return <div className="space-y-6">
    <header><div className="flex items-center gap-2"><Map size={18} className="text-primary" /><h3 className="text-lg font-semibold text-foreground">Maps</h3></div><p className="mt-1 text-[13px] text-muted-foreground">Configure operational map integrations. Credentials stay in the operating-system keychain.</p></header>
    {notice ? <p role="status" className="border border-border bg-muted/40 px-3 py-2 text-[11px] text-foreground">{notice}</p> : null}
    <section className="space-y-2"><div><h4 className="text-[12px] font-medium text-foreground">Built-in data</h4><p className="mt-1 text-[11px] text-muted-foreground">These public data services are configured by Zen and need no user credential.</p></div><div className="divide-y divide-white/10 border border-border">{integrations.map((item) => <div key={item.name} className="flex items-center justify-between gap-3 px-3 py-2.5"><div><p className="text-[11px] text-foreground">{item.name}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{item.detail}</p></div><span className="shrink-0 text-[10px] text-success">{item.state}</span></div>)}</div></section>
    <section className="space-y-2"><div><h4 className="text-[12px] font-medium text-foreground">Routing and imagery</h4><p className="mt-1 text-[11px] text-muted-foreground">Keys are used only by backend map services. Google 3D tiles remain unavailable until Zen has a restricted public-token delivery path.</p></div><div className="space-y-2"><SecretField label="HERE routing API key" detail="Optional. Enables HERE routes when configured; otherwise Zen uses public routing." value={hereKey} present={hasSecret('here_api_key')} onChange={setHereKey} onClear={() => void clearSecret('here_api_key')} /><SecretField label="Google Maps API key" detail="Optional. Used for backend-supported map capabilities. Restrict this key in Google Cloud." value={googleKey} present={hasSecret('google_maps_api_key')} onChange={setGoogleKey} onClear={() => void clearSecret('google_maps_api_key')} /></div></section>
    <section className="space-y-2"><div className="flex items-center gap-2"><PlugZap size={15} className="text-primary" /><h4 className="text-[12px] font-medium text-foreground">Camera catalog</h4></div><p className="text-[11px] leading-5 text-muted-foreground">Use a vetted HTTPS JSON catalog owned by your organization. Zen rejects localhost, literal private IPs, redirects, oversized responses, and malformed JSON. Each item needs id, label, operator, latitude, longitude, sourceUrl, streamFormat, status, and isDemo. streamUrl, attribution, and termsUrl are optional. All URLs must use HTTPS.</p><div className="border border-border bg-muted/30 p-3"><label className="text-[10px] text-muted-foreground">Catalog URL</label><input value={catalogUrl} onChange={(event) => setCatalogUrl(event.target.value)} placeholder="https://maps.example.com/cameras.json" className="mt-1 h-8 w-full border border-border bg-background/30 px-2 text-[11px] text-foreground outline-none focus:border-primary/60" /><div className="mt-3"><SecretField label="Catalog bearer token" detail="Optional. Sent only by the Rust catalog service." value={catalogToken} present={hasSecret('maps_camera_catalog_token')} onChange={setCatalogToken} onClear={() => void clearSecret('maps_camera_catalog_token')} /></div><button type="button" disabled={testing || !catalogUrl.trim()} onClick={() => void testCatalog()} className="mt-3 flex h-8 items-center gap-2 border border-border px-3 text-[11px] text-foreground hover:bg-muted disabled:opacity-50"><RotateCw size={13} className={testing ? 'animate-spin' : ''} /> Test catalog</button></div></section>
    <footer className="flex items-center justify-between border-t border-border pt-4"><span className="flex items-center gap-1 text-[10px] text-muted-foreground"><ShieldCheck size={13} /> Secrets are not written to normal settings storage.</span><button type="button" disabled={saving} onClick={() => void save()} className="border border-primary/40 bg-primary/15 px-3 py-2 text-[11px] font-medium text-primary hover:bg-primary/25 disabled:opacity-50">{saving ? 'Saving...' : 'Save map connections'}</button></footer>
  </div>;
}

export default MapConfiguration;
