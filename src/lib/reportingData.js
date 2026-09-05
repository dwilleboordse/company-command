// Fresh, deterministically ordered queries avoid the Data API's default row limit.
export async function fetchAllRows(queryFactory) {
  const data = []
  const pageSize = 500
  try {
    for (let offset = 0; ; offset += pageSize) {
      const result = await queryFactory().range(offset, offset + pageSize - 1)
      if (result.error) return { data: null, error: result.error }
      data.push(...(result.data || []))
      if (!result.data || result.data.length < pageSize) return { data, error: null }
    }
  } catch (error) {
    return { data: null, error }
  }
}
