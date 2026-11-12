import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { localDate } from '../lib/model.js';
import './SchoolGrades.css';

function GradeFace({ color }) {
  const colors = { green: ['#b7eb83', '#447342'], yellow: ['#ffdf83', '#9a6e25'], red: ['#ffb0a5', '#a65449'] }[color];
  return <svg viewBox="0 0 60 60" aria-hidden="true"><circle cx="30" cy="30" r="26" fill={colors[0]} stroke={colors[1]} strokeWidth="2"/><ellipse cx="21" cy="26" rx="2" ry="3" fill={colors[1]}/><ellipse cx="39" cy="26" rx="2" ry="3" fill={colors[1]}/><path d={color === 'green' ? 'M20 35q10 13 20 0' : color === 'yellow' ? 'M23 38h14' : 'M23 40q7-7 14 0'} fill="none" stroke={colors[1]} strokeWidth="2.5" strokeLinecap="round"/></svg>;
}

export default function SchoolGrades({ state, onEdit, onReset }) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12));
  const [date, setDate] = useState(localDate());
  const today = localDate();
  const grades = useMemo(() => new Map(state.behaviors.map(entry => [entry.date, entry])), [state.behaviors]);
  const cells = [];
  const firstWeekday = (month.getDay() + 6) % 7;
  if (firstWeekday < 5) for (let i = 0; i < firstWeekday; i++) cells.push(null);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  for (let day = 1; day <= last; day++) {
    const value = new Date(month.getFullYear(), month.getMonth(), day, 12);
    if (![0, 6].includes(value.getDay())) cells.push(localDate(value));
  }
  const changeMonth = delta => setMonth(value => new Date(value.getFullYear(), value.getMonth() + delta, 1, 12));
  const futureMonth = month.getFullYear() > new Date().getFullYear() || (month.getFullYear() === new Date().getFullYear() && month.getMonth() >= new Date().getMonth());

  return <>
    <div className="modal-heading-icon"><CalendarDays size={25}/></div>
    <span className="eyebrow">YOU CHOOSE. YOU SAVE. THEY EARN.</span>
    <h2 id="modal-title">Their grades. Your control.</h2>
    <p className="modal-intro">Nothing is awarded automatically. Pick any school day to add, change, or remove its teacher’s face.</p>
    <div className="school-calendar-heading">
      <button className="icon-button" aria-label="Previous month" onClick={() => changeMonth(-1)}><ChevronLeft size={19}/></button>
      <h3>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3>
      <button className="icon-button" aria-label="Next month" disabled={futureMonth} onClick={() => changeMonth(1)}><ChevronRight size={19}/></button>
    </div>
    <div className="school-calendar" role="group" aria-label="School grades calendar">
      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(label => <span className="school-weekday" key={label}>{label}</span>)}
      {cells.map((value, index) => {
        if (!value) return <span key={`empty-${index}`}/>;
        const entry = grades.get(value);
        const day = Number(value.slice(-2));
        const label = `${new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}: ${entry ? `${entry.color} grade. Edit or remove.` : 'No grade recorded. Add a grade.'}`;
        return <button key={value} className={`school-calendar-day ${value === today ? 'is-today' : ''} ${entry ? 'has-grade' : ''}`} disabled={value > today} aria-label={label} onClick={() => onEdit(value)}>
          <span>{day}</span>
          {entry ? <GradeFace color={entry.color}/> : <Plus size={17}/>}
          <small>{entry ? entry.color : 'No grade'}</small>
        </button>;
      })}
    </div>
    <form className="school-date-form" onSubmit={event => { event.preventDefault(); onEdit(date); }}>
      <label>Or choose a school date<input type="date" max={today} value={date} required onChange={event => setDate(event.target.value)}/></label>
      <button className="button secondary">Open this day <ChevronRight size={15}/></button>
    </form>
    <p className="modal-footnote">Corrections update the green streak and star bonuses. Removing a grade returns that day to “No grade.” Your last change can be undone.</p>
    <button className="remove-grade-button" onClick={onReset}>Reset all faces</button>
  </>;
}
