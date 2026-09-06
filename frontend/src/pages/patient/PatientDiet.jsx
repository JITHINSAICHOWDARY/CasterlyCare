import { useEffect, useRef, useState } from 'react';
import { patientService } from '../../api/services/patient';
import { apiErrorMessage } from '../../api/client';
import PatientDashboardShell from '../../components/PatientDashboardShell';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Field,
  Panel,
  PageHeader,
  SectionHeading,
} from '../../components/ui';

const STATUS_VARIANT = {
  Safe: 'forest',
  Caution: 'amber',
  Restricted: 'danger',
};

const STATUS_COPY = {
  Safe: {
    title: 'Safe according to the current check',
    detail:
      'No restriction conflict was identified by the automated check. Continue to follow your clinician-configured dietary restrictions.',
    variant: 'success',
  },
  Caution: {
    title: 'Caution recommended',
    detail:
      'The automated check identified factors that may need care or clarification. Review the explanation before deciding what to eat.',
    variant: 'warning',
  },
  Restricted: {
    title: 'Restricted by the current check',
    detail:
      "The automated check found a restriction concern. Do not treat this result as a diagnosis; follow your clinician's dietary instructions.",
    variant: 'danger',
  },
};

const MAX_QUERY_LENGTH = 240;
const MAX_HISTORY_ITEMS = 12;

function formatCheckedAt(value) {
  if (!value) return 'Time unavailable';

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime())
    ? 'Time unavailable'
    : date.toLocaleString();
}

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
  const [lastCheckedAt, setLastCheckedAt] = useState(null);
  const [activeRestrictions, setActiveRestrictions] = useState([]);
  const [restrictionsNotice, setRestrictionsNotice] = useState('');

  const inputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function loadRestrictions() {
      try {
        const res = await patientService.getProfile();

        const source =
          res?.data?.activeCareEpisode ||
          res?.data?.currentCareEpisode ||
          res?.data;

        const restrictions = normalizeRestrictions(
          source?.foodRestrictions ||
            source?.food_restrictions ||
            source?.dietaryRestrictions ||
            source?.restrictions
        );

        if (!cancelled) {
          setActiveRestrictions(restrictions);

          setRestrictionsNotice(
            restrictions.length
              ? ''
              : 'No active dietary restrictions are currently available in your care record.'
          );
        }
      } catch (err) {
        if (!cancelled) {
          setRestrictionsNotice(apiErrorMessage(err));
        }
      }
    }

    loadRestrictions();

    return () => {
      cancelled = true;
    };
  }, []);

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

      setLastCheckedAt(new Date());
      setFoodItem('');
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function reuseQuery(query) {
    setFoodItem(query);
    setError('');
    inputRef.current?.focus();
  }

  function clearHistory() {
    setHistory([]);
  }

  return (
    <PatientDashboardShell>
      <main id="main-content">
        <PageHeader
          eyebrow="Nutrition support"
          title="Diet Management"
          subtitle="Check a meal or ingredient against the dietary restrictions configured for your current recovery episode."
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

              <p className="text-xs text-[var(--color-text-soft)]">
                These clinician-configured restrictions should be followed
                even when an automated food result appears permissive.
              </p>
            </div>
          </Panel>
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
          <Panel
            title="Check a food"
            subtitle="Ask about a meal, ingredient, or preparation method."
          >
            <form onSubmit={check} noValidate className="space-y-4">
              <Field
                label="Food or meal query"
                hint={`Example: Can I eat spicy chicken soup? · ${foodItem.length}/${MAX_QUERY_LENGTH}`}
                error={error}
              >
                <textarea
                  ref={inputRef}
                  className="field-textarea"
                  name="foodItem"
                  rows={4}
                  maxLength={MAX_QUERY_LENGTH}
                  placeholder="e.g. Can I eat spicy chicken soup?"
                  value={foodItem}
                  onChange={(e) => {
                    setFoodItem(e.target.value);

                    if (error) {
                      setError('');
                    }
                  }}
                  aria-invalid={Boolean(error)}
                  aria-describedby="diet-query-help"
                  autoComplete="off"
                  spellCheck="true"
                />
              </Field>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="submit"
                  loading={busy}
                  disabled={!foodItem.trim()}
                >
                  {busy ? 'Checking…' : 'Check food'}
                </Button>

                <span
                  className="text-xs text-[var(--color-text-soft)]"
                  role="status"
                  aria-live="polite"
                >
                  {busy
                    ? 'Your query is being checked securely.'
                    : lastCheckedAt
                      ? `Last checked ${lastCheckedAt.toLocaleTimeString()}`
                      : 'No query checked yet.'}
                </span>
              </div>
            </form>
          </Panel>

          <Panel
            title="How this works"
            subtitle="A decision-support feature, not a diagnosis."
          >
            <div className="space-y-3 text-sm text-[var(--color-text-soft)]">
              <div className="diet-safety-step">
                <Badge variant="ink">1</Badge>
                <p>
                  Your query is evaluated using the dietary restrictions set
                  for your active recovery care.
                </p>
              </div>

              <div className="diet-safety-step">
                <Badge variant="amber">2</Badge>
                <p>
                  The result is classified as Safe, Caution, or Restricted
                  with an explanation.
                </p>
              </div>

              <div className="diet-safety-step">
                <Badge variant="danger">3</Badge>
                <p>
                  When unsure or when symptoms are involved, contact your
                  doctor through Emergency Chat.
                </p>
              </div>

              <Alert variant="warning" title="Clinical safety">
                Dietary checks are automated support and should not replace
                instructions from your treating clinician, especially after
                surgery or when symptoms are present.
              </Alert>
            </div>
          </Panel>
        </div>

        <section className="mt-8" aria-labelledby="diet-history-title">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <SectionHeading
              title="Recent checks"
              subtitle={
                history.length
                  ? `${history.length} check${
                      history.length === 1 ? '' : 's'
                    } in this session${
                      history.length === MAX_HISTORY_ITEMS
                        ? ' · showing the latest checks'
                        : ''
                    }`
                  : 'Your recent food checks will appear here.'
              }
            />

            {history.length ? (
              <Button
                variant="ghost"
                type="button"
                onClick={clearHistory}
                aria-label="Clear recent food checks"
              >
                Clear history
              </Button>
            ) : null}
          </div>

          {history.length === 0 ? (
            <Panel>
              <EmptyState
                title="No food checks yet"
                subtitle="Start with a meal or ingredient above. Results shown here are session history only."
              />
            </Panel>
          ) : (
            <div className="space-y-3">
              {history.map((item) => {
                const statusCopy =
                  STATUS_COPY[item.status] || STATUS_COPY.Caution;

                const matches = item.matchedRestrictions?.length
                  ? item.matchedRestrictions
                  : item.restrictions || [];

                return (
                  <article
                    className={`panel p-5 diet-result-card diet-result-card--${item.status.toLowerCase()}`}
                    key={item.id}
                    aria-label={`${item.status} diet check`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="break-words font-semibold text-[var(--color-ink)]">
                            {item.foodItem}
                          </p>

                          <Badge
                            variant={
                              STATUS_VARIANT[item.status] || 'amber'
                            }
                          >
                            {item.status}
                          </Badge>
                        </div>

                        <p className="mt-2 text-xs uppercase tracking-[0.08em] text-[var(--color-text-soft)]">
                          {statusCopy.title}
                        </p>

                        <p className="mt-2 text-sm leading-6 text-[var(--color-text-soft)]">
                          {item.explanation}
                        </p>
                      </div>

                      {item.checkedAt ? (
                        <time
                          className="whitespace-nowrap text-xs text-[var(--color-text-soft)]"
                          dateTime={new Date(item.checkedAt).toISOString()}
                        >
                          {formatCheckedAt(item.checkedAt)}
                        </time>
                      ) : null}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={() => reuseQuery(item.foodItem)}
                      >
                        Check again
                      </Button>
                    </div>

                    <div
                      className="diet-result-guidance mt-4"
                      data-variant={statusCopy.variant}
                    >
                      <p className="font-medium text-[var(--color-ink)]">
                        {statusCopy.detail}
                      </p>

                      {matches.length ? (
                        <div className="mt-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-text-soft)]">
                            Relevant restrictions
                          </p>

                          <ul className="mt-2 space-y-1 text-sm text-[var(--color-text-soft)]">
                            {matches.map((match) => (
                              <li key={match.id}>
                                <span className="font-medium text-[var(--color-ink)]">
                                  {match.label}
                                </span>
                                {match.detail ? ` — ${match.detail}` : ''}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {item.status !== 'Safe' ? (
                        <p className="mt-3 text-xs text-[var(--color-text-soft)]">
                          When uncertain, especially with symptoms or
                          post-operative concerns, use Emergency Chat to
                          contact your doctor.
                        </p>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <p id="diet-query-help" className="sr-only">
          Enter one meal, ingredient, or food question. Results are guidance
          only.
        </p>
      </main>
    </PatientDashboardShell>
  );
}