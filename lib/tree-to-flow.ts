import { Node, Edge } from 'reactflow'
import { DecisionTree, ProcedureList } from './types'

interface TreeNode {
  id: string
  tree: DecisionTree | ProcedureList
  parentId?: string
  optionText?: string
}

export function convertTreeToFlow(
  tree: DecisionTree,
  currentPath: string[]
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []
  
  const LEVEL_HEIGHT = 150
  const NODE_WIDTH = 280
  const HORIZONTAL_SPACING = 350
  
  // BFS traversal to calculate positions
  const queue: TreeNode[] = [{ id: '0', tree }]
  const levelNodes: TreeNode[][] = [[queue[0]]]
  let nodeIdCounter = 1
  
  while (queue.length > 0) {
    const levelSize = queue.length
    const nextLevel: TreeNode[] = []
    
    for (let i = 0; i < levelSize; i++) {
      const current = queue.shift()!
      
      if ('children' in current.tree && 'options' in current.tree) {
        current.tree.children.forEach((child, index) => {
          const childId = nodeIdCounter.toString()
          nodeIdCounter++
          
          const childNode: TreeNode = {
            id: childId,
            tree: child,
            parentId: current.id,
            optionText: (current.tree as DecisionTree).options[index]
          }
          
          nextLevel.push(childNode)
          queue.push(childNode)
          
          // Create edge
          edges.push({
            id: `e${current.id}-${childId}`,
            source: current.id,
            target: childId,
            animated: currentPath.includes(childId),
            style: {
              stroke: currentPath.includes(childId) ? '#3B82F6' : '#6B7280',
              strokeWidth: currentPath.includes(childId) ? 2 : 1
            }
          })
        })
      }
    }
    
    if (nextLevel.length > 0) {
      levelNodes.push(nextLevel)
    }
  }
  
  // Calculate positions and create nodes
  levelNodes.forEach((level, levelIndex) => {
    const levelWidth = level.length * HORIZONTAL_SPACING
    const startX = -levelWidth / 2 + HORIZONTAL_SPACING / 2
    
    level.forEach((node, nodeIndex) => {
      const x = startX + nodeIndex * HORIZONTAL_SPACING
      const y = levelIndex * LEVEL_HEIGHT
      
      const isCurrentPath = currentPath.includes(node.id)
      const isCompleted = currentPath.indexOf(node.id) < currentPath.length - 1
      
      if ('procedureList' in node.tree) {
        // Procedure node
        nodes.push({
          id: node.id,
          type: 'default',
          position: { x, y },
          data: {
            label: `手続き一覧 (${node.tree.procedureList.length}件)`,
            isCurrentPath,
            isFinal: true
          },
          style: {
            backgroundColor: '#7C3AED',
            color: 'white',
            borderColor: '#5B21B6',
            borderWidth: 2,
            borderRadius: 8,
            padding: 12,
            width: NODE_WIDTH
          }
        })
      } else {
        // Question node
        const nodeStyle = isCurrentPath
          ? isCompleted
            ? { backgroundColor: '#10B981', color: 'white', borderColor: '#059669' }
            : { backgroundColor: '#3B82F6', color: 'white', borderColor: '#1D4ED8' }
          : { backgroundColor: '#F3F4F6', color: '#6B7280', borderColor: '#D1D5DB' }
        
        nodes.push({
          id: node.id,
          type: 'default',
          position: { x, y },
          data: {
            label: node.optionText || ('question' in node.tree ? node.tree.question : ''),
            description: 'question' in node.tree ? node.tree.question : '',
            isCurrentPath,
            isCompleted
          },
          style: {
            ...nodeStyle,
            borderWidth: 2,
            borderRadius: 8,
            padding: 12,
            width: NODE_WIDTH
          }
        })
      }
    })
  })
  
  return { nodes, edges }
}