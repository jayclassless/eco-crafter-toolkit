export interface TalentRow {
  id: string
  userTalentId: string
  name: string
  talentGroupName: string
  level: number
  isLevelable: boolean
  maxTalentLevel: number
}

export interface UserSkillRow {
  id: string
  skillId: string
  name: string
  rawName: string
  maxLevel: number
  talents: TalentRow[]
}
