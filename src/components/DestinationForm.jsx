import { useMemo, useState } from 'react';
import { Check, Globe2, Map, MapPin, Plus, Star } from 'lucide-react';
import { destinationFitsMap, renderAdventureMap, unprojectMapPoint } from '../lib/maps.js';
import './DestinationForm.css';

const ICONS = ['📍', '🏖️', '🏝️', '🐚', '🏡', '🏕️', '🎢', '🦋'];
const limits = region => region === 'us'
  ? { minLat: 24, maxLat: 50, minLon: -125, maxLon: -66 }
  : { minLat: -90, maxLat: 90, minLon: -180, maxLon: 180 };

function PlacePicker({ region, location, onChange }) {
  const [hint, setHint] = useState('');
  const markup = useMemo(() => renderAdventureMap({ region, selection: location }), [region, location]);

  const pick = event => {
    const svg = event.currentTarget.querySelector('svg');
    const rect = svg.getBoundingClientRect();
    const point = unprojectMapPoint(
      (event.clientX - rect.left) / rect.width * 1000,
      (event.clientY - rect.top) / rect.height * 540,
      region,
    );
    if (!point || !destinationFitsMap(point, region)) {
      setHint(region === 'us' ? 'Pick a spot in the mainland USA, or switch to World for islands and other places.' : 'Pick a spot inside the map.');
      return;
    }
    setHint('');
    onChange({ lat: Number(point.lat.toFixed(5)), lon: Number(point.lon.toFixed(5)) });
  };

  const move = event => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    const start = location || (region === 'us' ? { lat: 39, lon: -98 } : { lat: 20, lon: 0 });
    const step = region === 'us' ? .5 : 2;
    const bounds = limits(region);
    const lat = Math.min(bounds.maxLat, Math.max(bounds.minLat, start.lat + (event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0)));
    const lon = Math.min(bounds.maxLon, Math.max(bounds.minLon, start.lon + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0)));
    setHint('');
    onChange({ lat: Number(lat.toFixed(5)), lon: Number(lon.toFixed(5)) });
  };

  return <>
    <div
      className="place-map-canvas"
      role="button"
      tabIndex={0}
      aria-label="Choose a location on the map. Enter places a pin; arrow keys move it."
      aria-describedby="place-map-help"
      onClick={pick}
      onKeyDown={move}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
    <div className={`place-location-status ${location ? 'has-location' : ''}`} aria-live="polite">
      {location ? <><Check size={13}/> Your place is pinned. Tap again to move it.</> : <><MapPin size={13}/> Tap the map to drop your place’s pin.</>}
    </div>
    <p id="place-map-help" className="place-picker-help">An approximate spot is perfect. You can also enter exact coordinates below.</p>
    {hint && <p className="form-error" role="alert">{hint}</p>}
  </>;
}

export default function DestinationForm({ busy, initialRegion = 'us', onSubmit }) {
  const [name, setName] = useState('');
  const [country, setCountry] = useState(initialRegion === 'us' ? 'United States' : '');
  const [cost, setCost] = useState('50');
  const [emoji, setEmoji] = useState('🏖️');
  const [region, setRegion] = useState(initialRegion);
  const [location, setLocation] = useState(null);
  const [latText, setLatText] = useState('');
  const [lonText, setLonText] = useState('');
  const [fact, setFact] = useState('');
  const [error, setError] = useState('');
  const bounds = limits(region);

  const chooseLocation = value => {
    setLocation(value);
    setLatText(String(value.lat));
    setLonText(String(value.lon));
    setError('');
  };

  const changeRegion = value => {
    setRegion(value);
    if (value === 'us') setCountry('United States');
    else if (country === 'United States') setCountry('');
    const entered = latText.trim() && lonText.trim() ? { lat: Number(latText), lon: Number(lonText) } : location;
    setLocation(entered && destinationFitsMap(entered, value) ? entered : null);
    setError('');
  };

  const changeCoordinates = (latitude, longitude) => {
    setLatText(latitude);
    setLonText(longitude);
    const next = { lat: Number(latitude), lon: Number(longitude) };
    setLocation(latitude.trim() && longitude.trim() && destinationFitsMap(next, region) ? next : null);
    setError('');
  };

  const submit = event => {
    event.preventDefault();
    if (!location || !destinationFitsMap(location, region)) {
      setError('Drop a pin on the map so we know where your adventure belongs.');
      return;
    }
    onSubmit({ name: name.trim(), country: country.trim(), cost: Number(cost), emoji, region, ...location, fact: fact.trim() });
  };

  return <form className="destination-form" onSubmit={submit}>
    <div className="modal-heading-icon"><MapPin size={25}/></div>
    <span className="eyebrow">YOUR FAMILY’S FAVORITE PLACES</span>
    <h2 id="modal-title">A place to dream about.</h2>
    <p className="modal-intro">A sunny beach, Grandma’s house, or somewhere brand new. Give it a little star-powered magic.</p>

    <label>Place name
      <input data-autofocus value={name} onChange={event => setName(event.target.value)} maxLength={60} placeholder="Our favorite beach" required/>
    </label>
    <div className="place-details-row">
      <label>Country or area
        <input value={country} onChange={event => setCountry(event.target.value)} maxLength={80} placeholder="e.g. Florida, USA" required/>
      </label>
      <label><span className="place-cost-label"><Star size={12}/> Star cost</span>
        <input type="number" value={cost} onChange={event => setCost(event.target.value)} min="1" max="10000" step="1" required/>
      </label>
    </div>

    <fieldset className="place-icon-fieldset">
      <legend>Choose its little stamp</legend>
      <div className="emoji-picker place-emoji-picker">{ICONS.map(icon => <button key={icon} type="button" aria-label={`Use ${icon} stamp`} aria-pressed={emoji === icon} className={emoji === icon ? 'selected' : ''} onClick={() => setEmoji(icon)}>{icon}</button>)}</div>
    </fieldset>

    <div className="place-map-heading">
      <span>Where shall we put its pin?</span>
      <div className="segmented" aria-label="New place map">
        <button type="button" className={region === 'us' ? 'selected' : ''} aria-pressed={region === 'us'} onClick={() => changeRegion('us')}><Map size={13}/> USA</button>
        <button type="button" className={region === 'world' ? 'selected' : ''} aria-pressed={region === 'world'} onClick={() => changeRegion('world')}><Globe2 size={13}/> World</button>
      </div>
    </div>
    <PlacePicker region={region} location={location} onChange={chooseLocation}/>

    <details className="place-exact-location">
      <summary>Enter exact coordinates</summary>
      <div className="place-details-row">
        <label>Latitude
          <input type="number" min={bounds.minLat} max={bounds.maxLat} step="any" placeholder="27.51086" value={latText} onChange={event => changeCoordinates(event.target.value, lonText)}/>
        </label>
        <label>Longitude
          <input type="number" min={bounds.minLon} max={bounds.maxLon} step="any" placeholder="-82.71531" value={lonText} onChange={event => changeCoordinates(latText, event.target.value)}/>
        </label>
      </div>
    </details>

    <label>A little discovery <span className="optional">(optional)</span>
      <textarea rows={2} maxLength={250} placeholder="Look for tiny shells and make our biggest sandcastle yet!" value={fact} onChange={event => setFact(event.target.value)}/>
    </label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button primary full" disabled={busy}><Plus size={16}/>{busy ? 'Saving your place…' : 'Add to our adventure'}</button>
    <p className="modal-footnote">Adding a place is free. Stars are spent when your little explorer unlocks its virtual visit and passport stamp.</p>
  </form>;
}
