import { useCallback, useEffect, useRef, useState } from 'react';
import { patientService } from '../../api/services/patient';
import { apiErrorMessage } from '../../api/client';
import { PatientDashboardShell } from '../../components/RoleDashboardShell';
import {
  Badge,
  Button,
  Panel,
  PageHeader,
} from '../../components/ui';
import GlassLensFilter from '../../components/GlassLensFilter';
import { useRealtime } from '../../context/RealtimeContext';
import { CLINICAL_RECORD_REALTIME_EVENTS } from '../../config/realtimeEvents';

const STATUS_VARIANT = {
  Safe: 'forest',
  Caution: 'amber',
  Restricted: 'danger',
};

const MAX_QUERY_LENGTH = 240;
const MAX_HISTORY_ITEMS = 12;

function normalizeResult(result) {
  const status = ['Safe', 'Caution', 'Restricted'].includes(result?.status)
    ? result.status
    : 'Caution';

  return {
    status,
    explanation: String(
      result?.explanation ||
        result?.message ||
        'No explanation was returned.'
    ),
    restrictions: normalizeRestrictions(
      result?.restrictions ||
        result?.foodRestrictions ||
        result?.dietaryRestrictions
    ),
    matchedRestrictions: normalizeRestrictions(
      result?.matchedRestrictions ||
        result?.matched_restrictions ||
        result?.conflicts
    ),
  };
}

function normalizeRestrictions(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => {
      if (typeof item === 'string') {
        return {
          id: `restriction-${index}-${item}`,
          label: item,
          detail: '',
        };
      }

      const label = String(
        item?.dietTemplate ||
          item?.label ||
          item?.name ||
          item?.restriction ||
          item?.ingredientsToAvoid ||
          ''
      ).trim();

      const detail = String(
        item?.ingredientsToAvoid ||
          item?.detail ||
          item?.description ||
          ''
      ).trim();

      return label
        ? {
            id: item?.id || `restriction-${index}-${label}`,
            label,
            detail,
          }
        : null;
    })
    .filter(Boolean);
}

export default function PatientDiet() {
  const [foodItem, setFoodItem] = useState('');
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [activeRestrictions, setActiveRestrictions] = useState([]);
  const [restrictionsNotice, setRestrictionsNotice] = useState('');

  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const { subscribe } = useRealtime();

  const loadRestrictions = useCallback(async () => {
    try {
      const res = await patientService.getDietRestrictions();
      const restrictions = normalizeRestrictions(res?.data?.restrictions);
      setActiveRestrictions(restrictions);
      setRestrictionsNotice(
        restrictions.length
          ? ''
          : 'No active dietary restrictions are currently available in your care record.'
      );
    } catch (err) {
      setRestrictionsNotice(apiErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    loadRestrictions();
  }, [loadRestrictions]);

  useEffect(() => {
    const cleanups = CLINICAL_RECORD_REALTIME_EVENTS.map((eventName) =>
      subscribe(eventName, () => loadRestrictions()),
    );
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [subscribe, loadRestrictions]);

  async function check(e) {
    e.preventDefault();

    const query = foodItem.trim();

    if (!query) {
      setError('Enter a meal, ingredient, or food item to check.');
      inputRef.current?.focus();
      return;
    }

    if (query.length > MAX_QUERY_LENGTH) {
      setError(
        `Keep the food query to ${MAX_QUERY_LENGTH} characters or fewer.`
      );
      inputRef.current?.focus();
      return;
    }

    setBusy(true);
    setError('');

    try {
      const res = await patientService.checkDiet(query);
      const result = normalizeResult(res.data);

      if (result.restrictions.length) {
        setActiveRestrictions(result.restrictions);
      }

      setHistory((items) =>
        [
          {
            id: `${Date.now()}-${Math.random()}`,
            foodItem: query,
            checkedAt: new Date(),
            ...result,
          },
          ...items,
        ].slice(0, MAX_HISTORY_ITEMS)
      );

      setFoodItem('');
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function clearHistory() {
    setHistory([]);
  }

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [history, busy]);

  return (
    <PatientDashboardShell>
      <div className="patient-diet-page">
        <GlassLensFilter />
        <PageHeader
          title="Diet Management"
          subtitle="Check a meal or ingredient against your dietary restrictions."
        />

        <section className="mb-6" aria-labelledby="active-diet-title">
          <Panel
            title="Current dietary guidance"
            subtitle="Restrictions configured for your active recovery episode take priority over automated food-check guidance."
          >
            <div className="space-y-3">
              {activeRestrictions.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {activeRestrictions.map((restriction) => (
                    <article
                      className="panel-muted p-4"
                      key={restriction.id}
                    >
                      <p className="font-semibold text-[var(--color-ink)]">
                        {restriction.label}
                      </p>

                      {restriction.detail ? (
                        <p className="mt-1 break-words text-sm text-[var(--color-text-soft)]">
                          {restriction.detail}
                        </p>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[var(--color-text-soft)]">
                  {restrictionsNotice ||
                    'No dietary restrictions are currently listed for this active recovery episode.'}
                </p>
              )}
            </div>
          </Panel>
        </section>

        <Panel
          title="Check a food"
          action={history.length ? <Button variant="ghost" size="sm" type="button" onClick={clearHistory}>Clear history</Button> : null}
        >
          <div className="diet-chat-shell">
            <div className="patient-chat-messages diet-chat-log" aria-live="polite" aria-label="Food check conversation">
              {history.length === 0 ? (
                <div className="patient-chat-empty-state">Ask about a meal, ingredient, or preparation method to get started.</div>
              ) : (
                [...history].reverse().map((item) => {
                  const matches = item.matchedRestrictions?.length
                    ? item.matchedRestrictions
                    : item.restrictions || [];

                  return (
                    <div className="diet-qa-item" key={item.id}>
                      <p className="diet-qa-question">{item.foodItem}</p>
                      <div className="diet-qa-answer" data-status={item.status.toLowerCase()}>
                        <Badge variant={STATUS_VARIANT[item.status] || 'amber'}>{item.status}</Badge>
                        <p className="mt-1.5">{item.explanation}</p>
                        {matches.length ? (
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {matches.map((match) => (
                              <Badge key={match.id} variant="neutral">{match.label}</Badge>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
              {busy ? <p className="patient-chat-typing" role="status">Checking…</p> : null}
              <div ref={scrollRef} />
            </div>

            <form onSubmit={check} noValidate className="patient-chat-compose">
              <label className="sr-only" htmlFor="diet-food-input">Food or meal query</label>
              <input
                id="diet-food-input"
                ref={inputRef}
                className="field-input flex-1"
                maxLength={MAX_QUERY_LENGTH}
                placeholder="Ask about a meal, e.g. Can I eat spicy chicken soup?"
                value={foodItem}
                onChange={(e) => {
                  setFoodItem(e.target.value);
                  if (error) setError('');
                }}
                aria-invalid={Boolean(error)}
                autoComplete="off"
                disabled={busy}
              />
              <Button type="submit" loading={busy} disabled={busy || !foodItem.trim()}>Send</Button>
            </form>
            {error ? <p className="patient-chat-send-error px-4 pb-3" role="alert">{error}</p> : null}
          </div>
        </Panel>
      </div>
    </PatientDashboardShell>
  );
}