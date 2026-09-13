import type { SqliteDatabase } from '../db/open-database.js'

export function readV2ClosingRecap(
  database: SqliteDatabase,
  resetEpoch: number,
  includeBarrages: boolean,
) {
  const giftTotals = database.prepare(`SELECT gift.id AS giftId,
      gift.name AS giftName, COUNT(gift_tx.id) AS quantity,
      COALESCE(SUM(gift_tx.power_cost), 0) AS totalPower
    FROM gift_catalog gift
    LEFT JOIN v2_gift_transactions gift_tx ON gift_tx.gift_id = gift.id
      AND gift_tx.reset_epoch = ?
    WHERE gift.enabled = 1
    GROUP BY gift.id, gift.name, gift.sort_order
    ORDER BY gift.sort_order`).all(resetEpoch) as Array<{
      giftId: string
      giftName: string
      quantity: number
      totalPower: number
    }>
  const barrageCount = Number(database.prepare(`SELECT COUNT(*)
    FROM v2_barrages WHERE reset_epoch = ?`).pluck().get(resetEpoch))
  const barrages = includeBarrages ? database.prepare(`SELECT barrage.id AS barrageId,
      barrage.text, star.public_star_id AS publicStarId,
      CASE WHEN barrage.custom_color IS NOT NULL THEN 'personal'
           ELSE barrage.color_style END AS colorStyle,
      barrage.custom_color AS customColor,
      publication.status AS status,
      publication.display_seq AS displaySeq,
      publication.published_at AS publishedAt
    FROM v2_barrages barrage
    JOIN v2_public_stars star ON star.reset_epoch = barrage.reset_epoch
      AND star.identity_id = barrage.identity_id
    JOIN v2_barrage_publications publication
      ON publication.reset_epoch = barrage.reset_epoch
      AND publication.barrage_id = barrage.id
    WHERE barrage.reset_epoch = ? AND publication.status = 'PUBLISHED'
    ORDER BY barrage.created_at`).all(resetEpoch) : []
  return {
    barrageCount,
    barrages,
    giftTotals: giftTotals.map((item) => ({
      ...item,
      quantity: Number(item.quantity),
      totalPower: Number(item.totalPower),
    })),
    totalGiftQuantity: giftTotals.reduce((sum, item) => sum + Number(item.quantity), 0),
    totalGiftPower: giftTotals.reduce((sum, item) => sum + Number(item.totalPower), 0),
  }
}
