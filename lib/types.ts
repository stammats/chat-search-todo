export interface SearchResult {
  title: string
  url: string
  description: string
}

export interface CacheItem<T> {
  data: T
  expires: number
}

export interface DecisionTree {
  question: string
  key: string
  options: string[]
  children: (DecisionTree | ProcedureList)[]
  allowMultiple?: boolean
}

export interface Procedure {
  procedure_id: string
  name: string
  jurisdiction: string
  url: string
  requirements?: string
  deadline?: string
  fee?: string
}

export interface ProcedureList {
  procedureList: Procedure[]
}