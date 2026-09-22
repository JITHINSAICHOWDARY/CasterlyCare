import { useState } from 'react';
import NavIcon from './NavIcon';

// Type an item and press Enter or comma to turn it into a tag. Backspace on an
// empty box removes the last tag. `suggestions` are one-tap additions.
export default function TagInput({ id, tags, onChange, suggestions = [], placeholder = 'Type and press Enter', maxTags = 60, maxLength = 60 }) {
  const [draft, setDraft] = useState('');

  const has = (value) => tags.some((tag) => tag.toLowerCase() === value.toLowerCase());

  function commit(raw) {
    const additions = String(raw).split(',').map((item) => item.trim().slice(0, maxLength)).filter(Boolean);
    const next = [...tags];
    additions.forEach((item) => { if (next.length < maxTags && !next.some((tag) => tag.toLowerCase() === item.toLowerCase())) next.push(item); });
    if (next.length !== tags.length) onChange(next);
    setDraft('');
  }

  function onKeyDown(event) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commit(draft);
    } else if (event.key === 'Backspace' && !draft && tags.length) {
      onChange(tags.slice(0, -1));
    }
  }

  const open = suggestions.filter((item) => !has(item));

  return (
    <div className="taginput">
      <div className="taginput-box">
        {tags.map((tag) => (
          <span key={tag} className="tag">
            {tag}
            <button type="button" className="tag-x" onClick={() => onChange(tags.filter((item) => item !== tag))} aria-label={`Remove ${tag}`}><NavIcon name="x" size={12} /></button>
          </span>
        ))}
        <input
          id={id}
          className="taginput-field"
          value={draft}
          placeholder={tags.length ? '' : placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => draft.trim() && commit(draft)}
          maxLength={maxLength * 2}
          autoComplete="off"
        />
      </div>
      {open.length ? (
        <div className="taginput-suggest">
          <span>Suggestions</span>
          {open.map((item) => (
            <button key={item} type="button" className="tag is-suggestion" onClick={() => commit(item)}>
              <NavIcon name="plus" size={12} /> {item}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
