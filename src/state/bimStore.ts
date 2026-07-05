import { create } from 'zustand'

export interface IFCElement {
  globalId: string
  name: string
  type: string
  taskId: string
}

export interface Task {
  id: string
  name: string
  start: string
  end: string
  ifcIds: string[]
  color: string
}

export const ifcElements: IFCElement[] = [
  { globalId: 'A1',  name: 'Wall-N-001',    type: 'IfcWall',        taskId: 'task-1' },
  { globalId: 'A2',  name: 'Wall-S-001',    type: 'IfcWall',        taskId: 'task-1' },
  { globalId: 'A3',  name: 'Slab-GF-001',   type: 'IfcSlab',        taskId: 'task-1' },
  { globalId: 'A4',  name: 'Column-A1',     type: 'IfcColumn',      taskId: 'task-2' },
  { globalId: 'A5',  name: 'Column-B1',     type: 'IfcColumn',      taskId: 'task-2' },
  { globalId: 'A6',  name: 'Beam-AB-001',   type: 'IfcBeam',        taskId: 'task-2' },
  { globalId: 'A7',  name: 'Slab-L1-001',   type: 'IfcSlab',        taskId: 'task-3' },
  { globalId: 'A8',  name: 'Wall-Facade-N', type: 'IfcCurtainWall', taskId: 'task-3' },
  { globalId: 'A9',  name: 'Pipe-HVAC-001', type: 'IfcFlowSegment', taskId: 'task-4' },
  { globalId: 'A10', name: 'Duct-001',      type: 'IfcFlowSegment', taskId: 'task-4' },
  { globalId: 'A11', name: 'Stair-Core',    type: 'IfcStair',       taskId: 'task-5' },
  { globalId: 'A12', name: 'Floor-Fin-1',   type: 'IfcCovering',    taskId: 'task-5' },
]

export const tasks: Task[] = [
  { id: 'task-1', name: 'Foundation Works',  start: '2024-01-01', end: '2024-02-28', ifcIds: ['A1','A2','A3'],      color: '#E67E22' },
  { id: 'task-2', name: 'Structural Frame',  start: '2024-02-15', end: '2024-04-30', ifcIds: ['A4','A5','A6'],      color: '#3498DB' },
  { id: 'task-3', name: 'Facade & Slabs',    start: '2024-04-01', end: '2024-06-30', ifcIds: ['A7','A8'],           color: '#9B59B6' },
  { id: 'task-4', name: 'MEP Installation',  start: '2024-05-15', end: '2024-08-31', ifcIds: ['A9','A10'],          color: '#1ABC9C' },
  { id: 'task-5', name: 'Finishes',          start: '2024-08-01', end: '2024-11-30', ifcIds: ['A11','A12'],         color: '#E74C3C' },
]

const PROJECT_START = new Date('2024-01-01').getTime()
const PROJECT_END   = new Date('2024-12-31').getTime()

function progressToDate(progress: number): Date {
  const t = PROJECT_START + ((PROJECT_END - PROJECT_START) * progress) / 100
  return new Date(t)
}

export type ElementStatus = 'completed' | 'active' | 'future'

interface BIMState {
  selectedIFCId: string | null
  selectedTaskId: string | null
  timelineProgress: number
  currentDate: Date
  ifcElements: IFCElement[]
  tasks: Task[]
  setSelectedIFCId: (id: string | null) => void
  setSelectedTaskId: (id: string | null) => void
  setTimelineProgress: (val: number) => void
  getElementStatus: (globalId: string) => ElementStatus
  getTaskStatus: (taskId: string) => ElementStatus
}

export const useBIMStore = create<BIMState>((set, get) => ({
  selectedIFCId: null,
  selectedTaskId: null,
  timelineProgress: 35,
  currentDate: progressToDate(35),
  ifcElements,
  tasks,

  setSelectedIFCId: (id) => {
    const element = ifcElements.find(e => e.globalId === id) ?? null
    set({
      selectedIFCId: id,
      selectedTaskId: element ? element.taskId : null,
    })
  },

  setSelectedTaskId: (id) => {
    const task = tasks.find(t => t.id === id) ?? null
    set({
      selectedTaskId: id,
      selectedIFCId: task ? task.ifcIds[0] : null,
    })
  },

  setTimelineProgress: (val) => {
    set({ timelineProgress: val, currentDate: progressToDate(val) })
  },

  getElementStatus: (globalId) => {
    const el = ifcElements.find(e => e.globalId === globalId)
    if (!el) return 'future'
    const task = tasks.find(t => t.id === el.taskId)
    if (!task) return 'future'
    const cur = get().currentDate.getTime()
    const s   = new Date(task.start).getTime()
    const e   = new Date(task.end).getTime()
    if (cur > e) return 'completed'
    if (cur >= s) return 'active'
    return 'future'
  },

  getTaskStatus: (taskId) => {
    const task = tasks.find(t => t.id === taskId)
    if (!task) return 'future'
    const cur = get().currentDate.getTime()
    const s   = new Date(task.start).getTime()
    const e   = new Date(task.end).getTime()
    if (cur > e) return 'completed'
    if (cur >= s) return 'active'
    return 'future'
  },
}))
