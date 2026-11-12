import { useState } from 'react';
import { LockKeyhole, Star } from 'lucide-react';

const points = value => Number(value).toLocaleString('en-US');

export default function DestinationPrices({ destinations, initialId, busy, onSubmit }) {
  const starting = destinations.find(place => place.id === initialId)
    || destinations.find(place => place.id === 'yellowstone')
    || destinations[0];
  const [destinationId, setDestinationId] = useState(starting.id);
  const [cost, setCost] = useState(String(starting.cost));
  const destination = destinations.find(place => place.id === destinationId);
  const choose = id => {
    const place = destinations.find(item => item.id === id);
    setDestinationId(id);
    setCost(String(place.cost));
  };

  return <form onSubmit={event => { event.preventDefault(); onSubmit(destinationId, Number(cost)); }}>
    <div className="modal-heading-icon"><Star size={25}/></div>
    <span className="eyebrow">EVERY ADVENTURE HAS YOUR PRICE</span>
    <h2 id="modal-title">Big trips. Bigger goals.</h2>
    <p className="modal-intro">An ice cream date is 30 stars. Travel starts in the thousands. Set the price that makes sense for your family.</p>
    <label>Choose a place
      <select value={destinationId} onChange={event => choose(event.target.value)}>
        {destinations.map(place => <option value={place.id} key={place.id}>{place.emoji} {place.name} · {points(place.cost)} stars</option>)}
      </select>
    </label>
    <label>Stars required
      <input data-autofocus type="number" min="1" max="100000" step="1" value={cost} onChange={event => setCost(event.target.value)} required/>
    </label>
    <div className="grade-edit-notice"><strong>{destination.emoji} {destination.name}</strong><br/>Current price: {points(destination.cost)} stars. Your new price applies to future unlocks. Existing stars and passport stamps stay as they are.</div>
    <button className="button primary full" disabled={busy}><LockKeyhole size={15}/> Save this place’s price</button>
    <p className="modal-footnote">You choose every destination’s cost, including built-in places. Prices from 1 to 100,000 stars are supported.</p>
  </form>;
}
