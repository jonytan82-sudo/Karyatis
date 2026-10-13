import { useMemo } from 'react';

/** Job titles grouped as in the CJM Marine Crew Role Reference. */
export function TitleSelect({ catalog, value, onChange, exclude = [], placeholder, id, ariaLabel }) {
  const groups = useMemo(() => {
    const g = [];
    (catalog?.titles || []).forEach((t) => {
      if (exclude.includes(t.title) || exclude.includes(t.group)) return;
      let grp = g.find((x) => x.name === t.group);
      if (!grp) g.push((grp = { name: t.group, items: [] }));
      grp.items.push(t.title);
    });
    return g;
  }, [catalog, exclude]);
  return (
    <select id={id} aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {groups.map((g) => (
        <optgroup key={g.name} label={g.name}>
          {g.items.map((t) => <option key={t}>{t}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

export const titleInfo = (catalog, title) => (catalog?.titles || []).find((t) => t.title === title);
export const accessInfo = (catalog, key) => (catalog?.access || []).find((a) => a.key === key);
export const deptNames = (catalog, list) => {
  if (!list || !list.length) return '';
  if (list.includes('all')) return 'All departments';
  return list.map((k) => (catalog?.departments || []).find((d) => d.key === k)?.label || k).join(', ');
};

/**
 * Title, access level and departments. Title is descriptive; access is what they can do.
 * isNew: picking a title fills in its suggested access. Editing an existing member never does that silently.
 */
export function RoleFields({ catalog, value, onChange, isNew, allowOversight, allowCommand }) {
  const info = titleInfo(catalog, value.title);
  const acc = accessInfo(catalog, value.access);
  const suggestion = info && (info.access !== value.access || (info.depts || []).join() !== (value.departments || []).join());

  const setTitle = (title) => {
    const t = titleInfo(catalog, title);
    if (isNew && t) onChange({ title, access: t.access, departments: t.depts || [] });
    else onChange({ ...value, title });
  };
  const useSuggested = () => onChange({ ...value, access: info.access, departments: info.depts || [] });
  const toggleDept = (k) => {
    const cur = (value.departments || []).filter((d) => d !== 'all');
    onChange({ ...value, departments: cur.includes(k) ? cur.filter((d) => d !== k) : [...cur, k] });
  };
  const accessOptions = (catalog?.access || []).filter((a) =>
    (a.key !== 'oversight' || allowOversight || value.access === 'oversight') && (a.key !== 'command' || allowCommand || value.access === 'command'));

  return (
    <div className="role-fields">
      <div className="two">
        <label>Job title
          <TitleSelect catalog={catalog} value={value.title} onChange={setTitle} />
        </label>
        <label>Access level
          <select value={value.access} onChange={(e) => {
            const a = accessInfo(catalog, e.target.value);
            onChange({ ...value, access: e.target.value, departments: a?.usesDepts ? (value.departments || []) : [] });
          }}>
            {accessOptions.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
          </select>
        </label>
      </div>
      {info && <p className="hint role-help"><b>{value.title}:</b> {info.help}</p>}
      {acc && <p className="hint role-help"><b>{acc.label}:</b> {acc.help}</p>}
      {acc?.usesDepts && (
        <fieldset className="dept-pick">
          <legend>Departments they can sign off</legend>
          {(value.departments || []).includes('all') ? (
            <p className="hint">All departments (kept from their earlier position). <button type="button" className="link" onClick={() => onChange({ ...value, departments: [] })}>Choose specific departments</button></p>
          ) : (
            <div className="dept-boxes">
              {(catalog?.departments || []).map((d) => (
                <label key={d.key} className="check">
                  <input type="checkbox" checked={(value.departments || []).includes(d.key)} onChange={() => toggleDept(d.key)} />{d.label}
                </label>
              ))}
            </div>
          )}
        </fieldset>
      )}
      {!isNew && suggestion && (
        <p className="hint">
          Usual for this title: {accessInfo(catalog, info.access)?.label}{info.depts?.length ? ` (${deptNames(catalog, info.depts)})` : ''}.{' '}
          <button type="button" className="link" onClick={useSuggested}>Use that</button>
        </p>
      )}
    </div>
  );
}

/** Reference: access levels, then all job titles by group. */
export function RoleReference({ catalog }) {
  const groups = useMemo(() => {
    const g = [];
    (catalog?.titles || []).forEach((t) => {
      let grp = g.find((x) => x.name === t.group);
      if (!grp) g.push((grp = { name: t.group, items: [] }));
      grp.items.push(t);
    });
    return g;
  }, [catalog]);
  if (!catalog) return null;
  return (
    <>
      <section className="group">
        <h3>Access levels</h3>
        <p className="hint">A job title describes the role. The access level, set by the Captain, controls what each person can do in CJM Marine.</p>
        <dl className="positions">
          {catalog.access.map((a) => <div key={a.key}><dt>{a.label}</dt><dd>{a.help}</dd></div>)}
        </dl>
      </section>
      <section className="group">
        <details className="titles-ref">
          <summary>Job titles ({catalog.titles.length})</summary>
          {groups.map((g) => (
            <div key={g.name} className="title-group">
              <h4>{g.name}</h4>
              <dl className="positions">
                {g.items.map((t) => (
                  <div key={t.title}>
                    <dt>{t.title}</dt>
                    <dd>{t.help}<span className="usual">Usually {accessInfo(catalog, t.access)?.label}{t.depts.length ? `, ${deptNames(catalog, t.depts)}` : ''}</span></dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
          <p className="hint">Typical role descriptions, not a legal manning schedule or mandatory qualifications. Titles and reporting lines vary by yacht size, flag, operating area and management structure.</p>
        </details>
      </section>
    </>
  );
}
