import { query } from '../lib/db.js'

// In-memory cache so the public counters don't hit the DB on every page load.
const TTL_MS = 60_000
let cache = { at: 0, data: null }

async function computeStats() {
  // Only CONFIRMED records count toward public figures.
  const [agg, byCountry, byYear, byRoute] = await Promise.all([
    query(`
      WITH yr AS (SELECT EXTRACT(YEAR FROM now())::int AS y)
      SELECT
        (SELECT count(*) FROM signatures WHERE confirmed_at IS NOT NULL) AS signatures,
        (SELECT count(*) FROM cases      WHERE confirmed_at IS NOT NULL) AS cases,
        (SELECT count(*) FROM claimants  WHERE confirmed_at IS NOT NULL) AS claimants,
        (SELECT count(DISTINCT country) FROM (
            SELECT country FROM signatures WHERE confirmed_at IS NOT NULL
            UNION SELECT country FROM cases WHERE confirmed_at IS NOT NULL
            UNION SELECT country FROM claimants WHERE confirmed_at IS NOT NULL
        ) c) AS countries,
        COALESCE((SELECT sum((SELECT y FROM yr) - application_year)
                  FROM cases WHERE confirmed_at IS NOT NULL), 0) AS combined_years,
        COALESCE((SELECT sum(investment_amount)
                  FROM cases WHERE confirmed_at IS NOT NULL), 0) AS capital_invested,
        COALESCE((SELECT avg((SELECT y FROM yr) - application_year)
                  FROM cases WHERE confirmed_at IS NOT NULL), 0) AS avg_wait,
        COALESCE((SELECT sum(family_members)
                  FROM cases WHERE confirmed_at IS NOT NULL), 0) AS families,
        COALESCE((SELECT count(*) FROM cases
                  WHERE confirmed_at IS NOT NULL
                    AND (EXTRACT(YEAR FROM now())::int - application_year) >= 2), 0)
          AS beyond_statutory
    `),
    query(`
      SELECT country, ROUND(COALESCE(sum(investment_amount),0) / 1e6, 1) AS value_m
      FROM cases WHERE confirmed_at IS NOT NULL
      GROUP BY country ORDER BY value_m DESC LIMIT 8
    `),
    query(`
      SELECT application_year::text AS year, count(*) AS value
      FROM cases WHERE confirmed_at IS NOT NULL
      GROUP BY application_year ORDER BY application_year
    `),
    query(`
      SELECT investment_type AS route, count(*) AS value
      FROM cases WHERE confirmed_at IS NOT NULL
      GROUP BY investment_type ORDER BY value DESC
    `),
  ])

  const r = agg.rows[0]
  return {
    signatures: Number(r.signatures),
    cases: Number(r.cases),
    claimants: Number(r.claimants),
    countries: Number(r.countries),
    combinedYears: Number(r.combined_years),
    capitalInvested: Number(r.capital_invested),
    avgWait: Number(Number(r.avg_wait).toFixed(1)),
    familiesAffected: Number(r.families),
    beyondStatutory: Number(r.beyond_statutory),
    capitalByCountry: byCountry.rows.map((x) => ({
      country: x.country,
      value: Number(x.value_m),
    })),
    pendingByYear: byYear.rows.map((x) => ({
      year: x.year,
      value: Number(x.value),
    })),
    investmentByRoute: byRoute.rows.map((x) => ({
      route: x.route,
      value: Number(x.value),
    })),
    updatedAt: new Date().toISOString(),
  }
}

export default async function statsRoute(fastify) {
  fastify.get('/api/stats', async () => {
    const now = Date.now()
    if (!cache.data || now - cache.at > TTL_MS) {
      cache = { at: now, data: await computeStats() }
    }
    return cache.data
  })
}
