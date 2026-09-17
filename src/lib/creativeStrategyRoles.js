// A job title is not an administrative access role. Both titles share the
// existing CS discipline, assignments, templates and workload calculations.
export const CREATIVE_STRATEGY_POSITIONS = ['creative_strategist', 'head_of_creative_strategy']

const positionOf = value => typeof value === 'string' ? value : value?.position

export const isCreativeStrategist = value => CREATIVE_STRATEGY_POSITIONS.includes(positionOf(value))

export const isHeadOfCreativeStrategy = value => positionOf(value) === 'head_of_creative_strategy'

export const getRoleDiscipline = position => isCreativeStrategist(position) ? 'creative_strategist' : position
