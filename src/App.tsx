import { useState, useCallback, useMemo, useRef } from 'react'
import './App.css'

// 色の定義: 0=透過, 1=白, 2=黒, 3=灰色
type Color = 0 | 1 | 2 | 3
const COLOR_NAMES = ['transparent', 'white', 'black', 'gray'] as const
const COLOR_VALUES = ['transparent', '#ffffff', '#1a1a1a', '#888888']

// 相対的な色番号: white(1) < black(2) < gray(3) < white(1)
function relativeColorNum(a: number, b: number): number {
  const diff = ((b - 1) - (a - 1) + 3) % 3
  return diff
}

interface TriangleCoord {
  x: number
  y: number
  isUp: boolean
}

interface ColoredTriangle {
  coord: TriangleCoord
  color: typeof COLOR_NAMES[number]
}

// 隣接判定
function areAdjacent(a: TriangleCoord, b: TriangleCoord): boolean {
  const dx = b.x - a.x
  const dy = b.y - a.y

  if (a.isUp) {
    if (!b.isUp) {
      if (dx === -1 && dy === 0) return true
      if (dx === 1 && dy === 0) return true
      if (dx === 0 && dy === -1) return true
    }
  } else {
    if (b.isUp) {
      if (dx === -1 && dy === 0) return true
      if (dx === 1 && dy === 0) return true
      if (dx === 0 && dy === 1) return true
    }
  }
  return false
}

// 行列式計算 (LU分解)
function determinant(matrix: number[][]): number {
  const n = matrix.length
  if (n === 0) return 1
  if (n === 1) return matrix[0][0]

  const m = matrix.map(row => [...row])
  let det = 1

  for (let i = 0; i < n; i++) {
    let maxRow = i
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(m[k][i]) > Math.abs(m[maxRow][i])) {
        maxRow = k
      }
    }

    if (Math.abs(m[maxRow][i]) < 1e-10) {
      return 0
    }

    if (maxRow !== i) {
      [m[i], m[maxRow]] = [m[maxRow], m[i]]
      det *= -1
    }

    det *= m[i][i]

    for (let k = i + 1; k < n; k++) {
      const factor = m[k][i] / m[i][i]
      for (let j = i; j < n; j++) {
        m[k][j] -= factor * m[i][j]
      }
    }
  }

  return det
}

// 連結成分数を計算（各色ごと）
function computeConnectedComponents(colorMap: Map<string, Color>): { white: number; black: number; gray: number } {
  const visited = new Set<string>()
  const result = { white: 0, black: 0, gray: 0 }

  const parseKey = (key: string): TriangleCoord => {
    const parts = key.split(',')
    return { x: parseInt(parts[0]), y: parseInt(parts[1]), isUp: parts[2] === 'u' }
  }

  const getKey = (x: number, y: number, isUp: boolean): string => `${x},${y},${isUp ? 'u' : 'd'}`

  // DFSで連結成分を探索
  const dfs = (startKey: string, targetColor: Color) => {
    const stack = [startKey]
    while (stack.length > 0) {
      const key = stack.pop()!
      if (visited.has(key)) continue
      const color = colorMap.get(key)
      if (color !== targetColor) continue
      visited.add(key)

      const coord = parseKey(key)
      // 隣接する三角形を探索
      const neighbors: TriangleCoord[] = coord.isUp
        ? [
            { x: coord.x - 1, y: coord.y, isUp: false },
            { x: coord.x + 1, y: coord.y, isUp: false },
            { x: coord.x, y: coord.y - 1, isUp: false }
          ]
        : [
            { x: coord.x - 1, y: coord.y, isUp: true },
            { x: coord.x + 1, y: coord.y, isUp: true },
            { x: coord.x, y: coord.y + 1, isUp: true }
          ]

      for (const n of neighbors) {
        const nKey = getKey(n.x, n.y, n.isUp)
        if (!visited.has(nKey) && colorMap.get(nKey) === targetColor) {
          stack.push(nKey)
        }
      }
    }
  }

  // 各色について連結成分をカウント
  for (const [key, color] of colorMap) {
    if (color === 0 || visited.has(key)) continue
    dfs(key, color)
    if (color === 1) result.white++
    else if (color === 2) result.black++
    else if (color === 3) result.gray++
  }

  return result
}

// グリッドサイズ
const GRID_SIZE = 17

type SortKey = 'attempt' | 'white' | 'black' | 'gray' | 'total'
type SearchMode = 'random' | 'exhaustive'

function App() {
  const [colors, setColors] = useState<Map<string, Color>>(new Map())
  const [jsonInput, setJsonInput] = useState('')
  const [shape, setShape] = useState<TriangleCoord[]>([])
  const [searchStatus, setSearchStatus] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchMode, setSearchMode] = useState<SearchMode>('exhaustive')
  const [searchProgress, setSearchProgress] = useState(0)
  const stopSearchRef = useRef(false)
  const [foundResults, setFoundResults] = useState<{
    colors: Map<string, Color>
    dets: { i: number; det: number }[]
    attempt: number
    connected: { white: number; black: number; gray: number }
  }[]>([])
  const [sortKey, setSortKey] = useState<SortKey>('attempt')
  const [sortAsc, setSortAsc] = useState(true)
  const [showJson, setShowJson] = useState(true)
  const [showMatrix, setShowMatrix] = useState(true)

  const getKey = (x: number, y: number, isUp: boolean): string => {
    return `${x},${y},${isUp ? 'u' : 'd'}`
  }

  const parseKey = (key: string): TriangleCoord => {
    const parts = key.split(',')
    return { x: parseInt(parts[0]), y: parseInt(parts[1]), isUp: parts[2] === 'u' }
  }

  const handleClick = useCallback((x: number, y: number, isUp: boolean) => {
    const key = getKey(x, y, isUp)
    setColors(prev => {
      const newColors = new Map(prev)
      const currentColor = prev.get(key) ?? 0
      const nextColor = ((currentColor + 1) % 4) as Color
      if (nextColor === 0) {
        newColors.delete(key)
      } else {
        newColors.set(key, nextColor)
      }
      return newColors
    })
  }, [])

  // JSON出力生成
  const generateJSON = useCallback((): ColoredTriangle[] => {
    const result: ColoredTriangle[] = []
    colors.forEach((color, key) => {
      if (color !== 0) {
        const coord = parseKey(key)
        result.push({ coord, color: COLOR_NAMES[color] })
      }
    })
    result.sort((a, b) => {
      if (a.coord.y !== b.coord.y) return b.coord.y - a.coord.y
      if (a.coord.x !== b.coord.x) return a.coord.x - b.coord.x
      return a.coord.isUp ? -1 : 1
    })
    return result
  }, [colors])

  // JSON入力処理
  const handleJsonImport = () => {
    try {
      const data: ColoredTriangle[] = JSON.parse(jsonInput)
      const newColors = new Map<string, Color>()
      data.forEach(item => {
        const key = getKey(item.coord.x, item.coord.y, item.coord.isUp)
        const colorIndex = COLOR_NAMES.indexOf(item.color) as Color
        if (colorIndex > 0) {
          newColors.set(key, colorIndex)
        }
      })
      setColors(newColors)
    } catch {
      alert('Invalid JSON')
    }
  }

  const handleClear = () => {
    setColors(new Map())
    setShape([])
    setSearchStatus('')
  }

  // 現在の輪郭を保存
  const handleSaveShape = () => {
    const coords: TriangleCoord[] = []
    colors.forEach((_, key) => {
      coords.push(parseKey(key))
    })
    setShape(coords)
    setSearchStatus(`輪郭保存: ${coords.length}個`)
  }

  // ランダムに色を生成
  const randomizeColors = (targetShape: TriangleCoord[], currentColors: Map<string, Color>): Map<string, Color> => {
    const newColors = new Map<string, Color>()
    targetShape.forEach(coord => {
      const key = getKey(coord.x, coord.y, coord.isUp)
      const currentColor = currentColors.get(key)
      if (currentColor === undefined || currentColor === 0) {
        return
      }
      const randomColor = (Math.floor(Math.random() * 3) + 1) as Color
      newColors.set(key, randomColor)
    })
    return newColors
  }

  const handleRandomize = () => {
    if (shape.length === 0 && colors.size === 0) {
      setSearchStatus('先に輪郭を描いてください')
      return
    }
    let targetShape = shape
    if (shape.length === 0) {
      targetShape = Array.from(colors.keys()).map(parseKey)
      setShape(targetShape)
      setSearchStatus(`輪郭保存: ${targetShape.length}個`)
    }
    setColors(randomizeColors(targetShape, colors))
  }

  // 小行列式を計算するヘルパー
  const computeMinorDets = (colorMap: Map<string, Color>): { i: number; det: number }[] => {
    const coloredTriangles: { coord: TriangleCoord; color: Color }[] = []
    colorMap.forEach((color, key) => {
      if (color !== 0) {
        coloredTriangles.push({ coord: parseKey(key), color })
      }
    })

    const n = coloredTriangles.length
    if (n <= 1) return []

    const mat: number[][] = Array(n).fill(null).map(() => Array(n).fill(0))
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i !== j) {
          const ti = coloredTriangles[i]
          const tj = coloredTriangles[j]
          if (areAdjacent(ti.coord, tj.coord)) {
            const rel = relativeColorNum(ti.color, tj.color)
            mat[i][j] = -rel
            mat[i][i] += rel
          }
        }
      }
    }

    return mat.map((_, i) => {
      const minor = mat
        .filter((_, ri) => ri !== i)
        .map(row => row.filter((_, ci) => ci !== i))
      return { i, det: determinant(minor) }
    })
  }

  // 優先度スコアを計算（W × B × G の積、小さいほど優先）
  const computePriorityScore = (connected: { white: number; black: number; gray: number }): number => {
    // 積が小さい = どれかの色がまとまっている = 情報量が多い
    return connected.white * connected.black * connected.gray
  }

  // 総パターン数を計算
  const totalPatterns = useMemo(() => {
    const n = shape.length > 0 ? shape.length : colors.size
    if (n === 0) return 0
    return Math.pow(3, n)
  }, [shape.length, colors.size])

  // 3進数でインデックスから色配列を生成
  const indexToColors = (index: number, targetShape: TriangleCoord[]): Map<string, Color> => {
    const newColors = new Map<string, Color>()
    let remaining = index
    for (let i = 0; i < targetShape.length; i++) {
      const coord = targetShape[i]
      const key = getKey(coord.x, coord.y, coord.isUp)
      const colorValue = (remaining % 3) + 1 as Color // 1, 2, or 3
      newColors.set(key, colorValue)
      remaining = Math.floor(remaining / 3)
    }
    return newColors
  }

  // 非ゼロ行列式を探索（優先度順に評価）
  const handleSearch = () => {
    if (shape.length === 0 && colors.size === 0) {
      setSearchStatus('先に輪郭を描いてください')
      return
    }

    let targetShape = shape
    if (shape.length === 0) {
      targetShape = Array.from(colors.keys()).map(parseKey)
      setShape(targetShape)
    }

    stopSearchRef.current = false
    setIsSearching(true)
    setFoundResults([])
    setSearchProgress(0)
    setSearchStatus('探索中...')

    const startTime = Date.now()
    const results: typeof foundResults = []

    if (searchMode === 'exhaustive') {
      // 全探索モード
      const total = Math.pow(3, targetShape.length)
      let currentIndex = 0

      const exhaustiveStep = () => {
        if (stopSearchRef.current) {
          const elapsed = (Date.now() - startTime) / 1000
          const progress = (currentIndex / total * 100).toFixed(2)
          setSearchStatus(`中止: ${currentIndex.toLocaleString()}/${total.toLocaleString()} (${progress}%), 発見${results.length}件 (${elapsed.toFixed(1)}秒)`)
          setFoundResults([...results])
          setIsSearching(false)
          return
        }

        // バッチ処理
        const batchSize = Math.min(1000, total - currentIndex)
        for (let i = 0; i < batchSize && currentIndex < total; i++, currentIndex++) {
          const testColors = indexToColors(currentIndex, targetShape)
          const dets = computeMinorDets(testColors)
          const allNonZero = dets.length > 0 && dets.every(d => Math.abs(d.det) > 0.0001)

          if (allNonZero) {
            const connected = computeConnectedComponents(testColors)
            results.push({
              colors: new Map(testColors),
              dets: [...dets],
              attempt: currentIndex + 1,
              connected
            })
          }
        }

        const progress = (currentIndex / total * 100)
        setSearchProgress(progress)
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
        setSearchStatus(`探索中... ${currentIndex.toLocaleString()}/${total.toLocaleString()} (${progress.toFixed(2)}%), 発見${results.length}件 (${elapsed}s)`)

        if (currentIndex < total) {
          requestAnimationFrame(exhaustiveStep)
        } else {
          const elapsed = (Date.now() - startTime) / 1000
          setSearchStatus(`完了: ${total.toLocaleString()}通り探索, 発見${results.length}件 (${elapsed.toFixed(1)}秒)`)
          setFoundResults([...results])
          setIsSearching(false)
          setSearchProgress(100)
        }
      }

      requestAnimationFrame(exhaustiveStep)
    } else {
      // ランダム探索モード
      let attempts = 0
      let evaluated = 0

      const searchStep = () => {
        if (stopSearchRef.current) {
          const elapsed = (Date.now() - startTime) / 1000
          setSearchStatus(`中止: 生成${attempts.toLocaleString()}件, 評価${evaluated.toLocaleString()}件, 発見${results.length}件 (${elapsed.toFixed(1)}秒)`)
          setFoundResults([...results])
          setIsSearching(false)
          return
        }

        // Step 1: バッチで候補を生成し、連結成分数を計算
        const batchSize = 1000
        const candidates: {
          colors: Map<string, Color>
          connected: { white: number; black: number; gray: number }
          priority: number
          attempt: number
        }[] = []

        for (let i = 0; i < batchSize; i++) {
          attempts++
          const testColors = randomizeColors(targetShape, colors)
          const connected = computeConnectedComponents(testColors)
          const priority = computePriorityScore(connected)
          candidates.push({
            colors: testColors,
            connected,
            priority,
            attempt: attempts
          })
        }

        // Step 2: 優先度（W×B×G）が小さい順にソート
        candidates.sort((a, b) => a.priority - b.priority)

        // Step 3: ソート順に行列式を計算
        for (const candidate of candidates) {
          evaluated++
          const dets = computeMinorDets(candidate.colors)
          const allNonZero = dets.length > 0 && dets.every(d => Math.abs(d.det) > 0.0001)

          if (allNonZero) {
            results.push({
              colors: new Map(candidate.colors),
              dets: [...dets],
              attempt: candidate.attempt,
              connected: candidate.connected
            })
          }
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
        setSearchStatus(`探索中... 生成${attempts.toLocaleString()}件, 発見${results.length}件 (${elapsed}s)`)
        requestAnimationFrame(searchStep)
      }

      requestAnimationFrame(searchStep)
    }
  }

  const handleStopSearch = () => {
    stopSearchRef.current = true
  }

  // ソートされた結果
  const sortedResults = useMemo(() => {
    const sorted = [...foundResults]
    sorted.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'attempt':
          cmp = a.attempt - b.attempt
          break
        case 'white':
          cmp = a.connected.white - b.connected.white
          break
        case 'black':
          cmp = a.connected.black - b.connected.black
          break
        case 'gray':
          cmp = a.connected.gray - b.connected.gray
          break
        case 'total':
          cmp = (a.connected.white + a.connected.black + a.connected.gray) -
                (b.connected.white + b.connected.black + b.connected.gray)
          break
      }
      return sortAsc ? cmp : -cmp
    })
    return sorted
  }, [foundResults, sortKey, sortAsc])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(true)
    }
  }

  // グラフ行列の計算
  const { matrix, labels } = useMemo(() => {
    const coloredTriangles: { coord: TriangleCoord; color: Color; key: string }[] = []
    colors.forEach((color, key) => {
      if (color !== 0) {
        coloredTriangles.push({ coord: parseKey(key), color, key })
      }
    })

    const n = coloredTriangles.length
    if (n === 0) return { matrix: [], labels: [] }

    const labels = coloredTriangles.map((t, i) =>
      `v${i}(${t.coord.x},${t.coord.y},${t.coord.isUp ? 'u' : 'd'})`
    )

    const mat: number[][] = Array(n).fill(null).map(() => Array(n).fill(0))

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i !== j) {
          const ti = coloredTriangles[i]
          const tj = coloredTriangles[j]
          if (areAdjacent(ti.coord, tj.coord)) {
            const rel = relativeColorNum(ti.color, tj.color)
            mat[i][j] = -rel
            mat[i][i] += rel
          }
        }
      }
    }

    return { matrix: mat, labels }
  }, [colors])

  // 全ての小行列式を計算
  const allMinorDets = useMemo(() => {
    if (matrix.length <= 1) return []

    return matrix.map((_, i) => {
      const minor = matrix
        .filter((_, ri) => ri !== i)
        .map(row => row.filter((_, ci) => ci !== i))
      return { i, det: determinant(minor) }
    })
  }, [matrix])

  // 現在の連結成分
  const currentConnected = useMemo(() => computeConnectedComponents(colors), [colors])

  // SVG設定 - 正方形にフィットするようviewBoxを使用
  const scale = 30
  const height = Math.sqrt(3) / 2 * scale
  const padding = scale * 0.8
  const svgSize = Math.max(GRID_SIZE * scale, GRID_SIZE * height) + padding * 2
  const originX = svgSize / 2
  const originY = svgSize / 2

  const getTrianglePath = (x: number, y: number, isUp: boolean): string => {
    const baseX = originX + x * scale / 2
    const baseY = originY - y * height

    if (isUp) {
      return `M ${baseX - scale/2} ${baseY + height/2} L ${baseX} ${baseY - height/2} L ${baseX + scale/2} ${baseY + height/2} Z`
    } else {
      return `M ${baseX - scale/2} ${baseY - height/2} L ${baseX + scale/2} ${baseY - height/2} L ${baseX} ${baseY + height/2} Z`
    }
  }

  // 18x18範囲の三角形生成
  const triangles: { x: number; y: number; isUp: boolean }[] = []
  for (let y = -9; y <= 8; y++) {
    for (let x = -17; x <= 17; x++) {
      const isUp = (x + y) % 2 === 0
      triangles.push({ x, y, isUp })
    }
  }

  const jsonOutput = JSON.stringify(generateJSON(), null, 2)

  return (
    <div className="app-grid">
      {/* 左カラム: キャンバス */}
      <div className="canvas-panel">
        <div className="canvas-header">
          <h1>Triangle Lattice</h1>
          <div className="legend">
            {[0, 1, 2, 3].map(i => (
              <span key={i} className="legend-item">
                <span className={`color-box ${COLOR_NAMES[i]}`}></span>
                {COLOR_NAMES[i][0].toUpperCase()}
              </span>
            ))}
          </div>
        </div>

        <div className="canvas-container">
          <svg viewBox={`0 0 ${svgSize} ${svgSize}`} className="canvas">
            {triangles.map(({ x, y, isUp }) => {
              const key = getKey(x, y, isUp)
              const color = colors.get(key) ?? 0
              return (
                <path
                  key={key}
                  d={getTrianglePath(x, y, isUp)}
                  fill={COLOR_VALUES[color]}
                  stroke="#555"
                  strokeWidth={0.5}
                  className="triangle"
                  onClick={() => handleClick(x, y, isUp)}
                />
              )
            })}
            <circle cx={originX} cy={originY} r={2} fill="red" />
          </svg>
        </div>

        <div className="canvas-info">
          <span>N={colors.size}</span>
          {shape.length > 0 && <span>輪郭={shape.length}</span>}
          <span>W:{currentConnected.white} B:{currentConnected.black} G:{currentConnected.gray}</span>
          {totalPatterns > 0 && <span className="total-patterns">全{totalPatterns.toLocaleString()}通り</span>}
        </div>

        <div className="controls">
          <button onClick={handleClear}>クリア</button>
          <button onClick={handleSaveShape} disabled={colors.size === 0}>輪郭保存</button>
          <button onClick={handleRandomize} disabled={isSearching}>ランダム</button>
          <select
            value={searchMode}
            onChange={(e) => setSearchMode(e.target.value as SearchMode)}
            disabled={isSearching}
            className="mode-select"
          >
            <option value="exhaustive">全探索</option>
            <option value="random">ランダム</option>
          </select>
          {!isSearching ? (
            <button onClick={handleSearch} className="search-btn">探索開始</button>
          ) : (
            <button onClick={handleStopSearch} className="stop-btn">中断</button>
          )}
        </div>

        {isSearching && searchMode === 'exhaustive' && (
          <div className="progress-container">
            <div className="progress-bar" style={{ width: `${searchProgress}%` }} />
            <span className="progress-text">{searchProgress.toFixed(2)}%</span>
          </div>
        )}

        {searchStatus && <div className="search-status">{searchStatus}</div>}
      </div>

      {/* 中央カラム: 探索結果 */}
      <div className="results-panel">
        <div className="results-header">
          <h2>探索結果 ({foundResults.length}件)</h2>
          {foundResults.length > 0 && (
            <button className="clear-btn" onClick={() => setFoundResults([])}>クリア</button>
          )}
        </div>

        <div className="results-table-container">
          <table className="results-table">
            <thead>
              <tr>
                <th className="sortable" onClick={() => handleSort('attempt')}>
                  # {sortKey === 'attempt' && (sortAsc ? '▲' : '▼')}
                </th>
                <th className="sortable" onClick={() => handleSort('white')}>
                  W {sortKey === 'white' && (sortAsc ? '▲' : '▼')}
                </th>
                <th className="sortable" onClick={() => handleSort('black')}>
                  B {sortKey === 'black' && (sortAsc ? '▲' : '▼')}
                </th>
                <th className="sortable" onClick={() => handleSort('gray')}>
                  G {sortKey === 'gray' && (sortAsc ? '▲' : '▼')}
                </th>
                <th className="sortable" onClick={() => handleSort('total')}>
                  計 {sortKey === 'total' && (sortAsc ? '▲' : '▼')}
                </th>
                <th>det</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedResults.map((result, idx) => {
                const total = result.connected.white + result.connected.black + result.connected.gray
                const detFirst = result.dets[0]?.det ?? 0
                return (
                  <tr key={idx}>
                    <td className="num-cell">{result.attempt}</td>
                    <td className="num-cell">{result.connected.white}</td>
                    <td className="num-cell">{result.connected.black}</td>
                    <td className="num-cell">{result.connected.gray}</td>
                    <td className="num-cell">{total}</td>
                    <td className="det-cell" title={result.dets.map(d => d.det).join(', ')}>
                      {detFirst}
                    </td>
                    <td>
                      <button
                        className="load-btn"
                        onClick={() => setColors(new Map(result.colors))}
                      >
                        適用
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 右カラム: 詳細情報 */}
      <div className="detail-panel">
        {/* 行列セクション */}
        <div className="collapsible-section">
          <div className="section-header" onClick={() => setShowMatrix(!showMatrix)}>
            <span>ラプラシアン行列 (N={matrix.length})</span>
            <span>{showMatrix ? '▼' : '▶'}</span>
          </div>
          {showMatrix && matrix.length > 0 && (
            <div className="section-content">
              <div className="matrix-scroll">
                <table className="matrix">
                  <thead>
                    <tr>
                      <th></th>
                      {matrix.map((_, i) => <th key={i}>{i}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.map((row, i) => (
                      <tr key={i}>
                        <th>{i}</th>
                        {row.map((val, j) => (
                          <td key={j}>{val}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="vertex-labels">
                {labels.map((label, i) => (
                  <span key={i} className="label">{label}</span>
                ))}
              </div>
              {allMinorDets.length > 0 && (
                <>
                  <div className="det-section-label">det(L[i,i]) = i行i列を除いた小行列式:</div>
                  <div className="det-list">
                    {allMinorDets.map(({ i, det }) => (
                      <span key={i} className={`det-item ${Math.abs(det) < 0.0001 ? 'zero' : ''}`}>
                        {i}:{det}
                      </span>
                    ))}
                  </div>
                  <div className="nonzero-indices">
                    非0: {'{'}
                    {allMinorDets.filter(d => Math.abs(d.det) > 0.0001).map(d => d.i).join(', ') || 'なし'}
                    {'}'}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* JSON セクション */}
        <div className="collapsible-section">
          <div className="section-header" onClick={() => setShowJson(!showJson)}>
            <span>JSON</span>
            <span>{showJson ? '▼' : '▶'}</span>
          </div>
          {showJson && (
            <div className="section-content">
              <div className="json-out">
                <textarea readOnly value={jsonOutput} rows={4} />
              </div>
              <div className="json-in">
                <textarea
                  value={jsonInput}
                  onChange={e => setJsonInput(e.target.value)}
                  rows={3}
                  placeholder="JSON..."
                />
                <button onClick={handleJsonImport}>インポート</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
