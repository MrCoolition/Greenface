import { useState } from 'react';
import { LockKeyhole, RotateCcw } from 'lucide-react';
import './SchoolGrades.css';

export default function ResetProgress({ busy, initialScope = 'faces', onResetFaces, onResetAll }) {
  const [scope, setScope] = useState(initialScope);
  const [confirmed, setConfirmed] = useState(false);
  return <form onSubmit={event => {
    event.preventDefault();
    if (confirmed) (scope === 'faces' ? onResetFaces : onResetAll)();
  }}>
    <div className="modal-heading-icon"><RotateCcw size={25}/></div>
    <span className="eyebrow">A FRESH START, APPROVED BY YOU</span>
    <h2 id="modal-title">Reset the adventure.</h2>
    <p className="modal-intro">Choose exactly what to clear. Your child’s name, point settings, rewards menu, and custom places stay.</p>
    <label className={`reset-option ${scope === 'faces' ? 'selected' : ''}`}>
      <input type="radio" name="reset-scope" value="faces" checked={scope === 'faces'} onChange={() => { setScope('faces'); setConfirmed(false); }}/>
      <span><strong>Reset all faces</strong><small>Clear every school grade and green streak. Grade stars are recalculated; the jar never increases. Passport stamps and redeemed rewards stay.</small></span>
    </label>
    <label className={`reset-option ${scope === 'all' ? 'selected' : ''}`}>
      <input type="radio" name="reset-scope" value="all" checked={scope === 'all'} onChange={() => { setScope('all'); setConfirmed(false); }}/>
      <span><strong>Clear faces, stars & trips</strong><small>Start at zero stars with no school faces, passport stamps, or redeemed rewards. This also removes any trips unlocked without your approval.</small></span>
    </label>
    <label className="checkbox-label reset-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} required/><span>{scope === 'faces' ? 'Clear all recorded school faces and recalculate the star jar.' : 'Clear all faces, stars, earned rewards, trips, and progress history.'}</span></label>
    <button className="button primary full" disabled={busy || !confirmed}><LockKeyhole size={15}/>{scope === 'faces' ? 'Reset all faces' : 'Clear faces, stars & trips'}</button>
    <p className="modal-footnote">Your PIN is required to confirm this reset. Every grade change, reward, and trip also needs a fresh PIN approval.</p>
  </form>;
}
