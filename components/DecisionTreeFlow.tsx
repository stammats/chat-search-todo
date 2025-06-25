'use client'
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useEffect } from 'react'
import { DecisionTree } from '@/lib/types'
import { convertTreeToFlow } from '@/lib/tree-to-flow'

interface DecisionTreeFlowProps {
  tree: DecisionTree
  currentPath: string[]
  onNodeClick?: (nodeId: string) => void
}

export default function DecisionTreeFlow({ 
  tree, 
  currentPath, 
  onNodeClick 
}: DecisionTreeFlowProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node[]>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge[]>([])

  useEffect(() => {
    const { nodes: flowNodes, edges: flowEdges } = convertTreeToFlow(tree, currentPath)
    setNodes(flowNodes)
    setEdges(flowEdges)
  }, [tree, currentPath, setNodes, setEdges])

  const handleNodeClick = (event: React.MouseEvent, node: Node) => {
    if (onNodeClick) {
      onNodeClick(node.id)
    }
  }

  return (
    <div className="w-full h-[600px] bg-gray-50 rounded-lg border border-gray-200">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        attributionPosition="bottom-left"
      >
        <Background />
        <Controls />
        <MiniMap 
          nodeColor={(node) => {
            if (node.data?.isFinal) return '#7C3AED'
            if (node.data?.isCompleted) return '#10B981'
            if (node.data?.isCurrentPath) return '#3B82F6'
            return '#F3F4F6'
          }}
        />
      </ReactFlow>
    </div>
  )
}