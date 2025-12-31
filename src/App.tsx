import { useState, useCallback, useMemo, useRef } from 'react'
import './App.css'

// 色の定義: 0=透過, 1=白, 2=黒, 3=灰色
type Color = 0 | 1 | 2 | 3
const COLOR_NAMES = ['transparent', 'white', 'black', 'gray'] as const
const COLOR_VALUES = ['transparent', '#ffffff', '#1a1a1a', '#888888']

// 相対的な色番号: white(1) < black(2) < gray(3) < white(1)
// 色aから色bへの相対番号 = (b - a + 3) % 3 (ただし a,b は 1,2,3)
function relativeColorNum(a: number, b: number): number {
  // a, b は 1, 2, 3 (white, black, gray)
  const diff = ((b - 1) - (a - 1) + 3) % 3
  return diff // 0, 1, or 2
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
    // 上向き三角形の隣接: 左(-1,0,down), 右(+1,0,down), 下(0,-1,down)
    if (!b.isUp) {
      if (dx === -1 && dy === 0) return true
      if (dx === 1 && dy === 0) return true
      if (dx === 0 && dy === -1) return true
    }
  } else {
    // 下向き三角形の隣接: 左(-1,0,up), 右(+1,0,up), 上(0,+1,up)
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

  // コピーを作成
  const m = matrix.map(row => [...row])
  let det = 1

  for (let i = 0; i < n; i++) {
    // ピボット選択
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

// グリッドサイズ
const GRID_SIZE = 8

function App() {
  const [colors, setColors] = useState<Map<string, Color>>(new Map())
  const [jsonInput, setJsonInput] = useState('')
  const [savedResults, setSavedResults] = useState<string[]>([])
  const [shape, setShape] = useState<TriangleCoord[]>([]) // 輪郭を保存
  const [searchStatus, setSearchStatus] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const stopSearchRef = useRef(false)

  const getKey = (x: number, y: number, isUp: boolean): string => {
    return `${x},${y},${isUp ? 'u' : 'd'}`
  }

  const parseKey = (key: string): TriangleCoord => {
    const parts = key.split(',')
    return {
      x: parseInt(parts[0]),
      y: parseInt(parts[1]),
      isUp: parts[2] === 'u'
    }
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
    setSearchStatus(`輪郭を保存: ${coords.length}個の三角形`)
  }

  // ランダムに色を生成 (1=白, 2=黒, 3=灰)
  const randomizeColors = (targetShape: TriangleCoord[]): Map<string, Color> => {
    const newColors = new Map<string, Color>()
    targetShape.forEach(coord => {
      const key = getKey(coord.x, coord.y, coord.isUp)
      const randomColor = (Math.floor(Math.random() * 3) + 1) as Color // 1, 2, or 3
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
      setSearchStatus(`輪郭を保存: ${targetShape.length}個の三角形`)
    }
    setColors(randomizeColors(targetShape))
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

    // 行列を構築
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

    // 全ての小行列式を計算
    return mat.map((_, i) => {
      const minor = mat
        .filter((_, ri) => ri !== i)
        .map(row => row.filter((_, ci) => ci !== i))
      return { i, det: determinant(minor) }
    })
  }

  // 非ゼロ行列式を探索
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
    setSearchStatus('探索中...')

    let attempts = 0
    const maxAttempts = 100000

    const searchStep = () => {
      if (stopSearchRef.current) {
        setSearchStatus(`探索を中止 (${attempts}回試行)`)
        setIsSearching(false)
        return
      }

      const batchSize = 1000
      for (let i = 0; i < batchSize && attempts < maxAttempts; i++) {
        attempts++
        const testColors = randomizeColors(targetShape)
        const dets = computeMinorDets(testColors)

        // 全ての小行列式が非ゼロかチェック
        const allNonZero = dets.length > 0 && dets.every(d => Math.abs(d.det) > 0.0001)

        if (allNonZero) {
          setColors(testColors)
          setSearchStatus(`発見! ${attempts}回目で非ゼロ行列式を発見`)
          setIsSearching(false)
          return
        }
      }

      if (attempts >= maxAttempts) {
        setSearchStatus(`${maxAttempts}回試行しましたが見つかりませんでした`)
        setIsSearching(false)
      } else {
        setSearchStatus(`探索中... ${attempts}回試行`)
        requestAnimationFrame(searchStep)
      }
    }

    requestAnimationFrame(searchStep)
  }

  const handleStopSearch = () => {
    stopSearchRef.current = true
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

    // 頂点ラベル生成
    const labels = coloredTriangles.map((t, i) =>
      `v${i}(${t.coord.x},${t.coord.y},${t.coord.isUp ? 'u' : 'd'})`
    )

    // 隣接行列とラプラシアン風行列を構築
    const mat: number[][] = Array(n).fill(null).map(() => Array(n).fill(0))

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i !== j) {
          const ti = coloredTriangles[i]
          const tj = coloredTriangles[j]
          if (areAdjacent(ti.coord, tj.coord)) {
            // 相対的な色番号
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

  // 結果保存
  const handleSaveResults = () => {
    if (allMinorDets.length === 0) return
    const timestamp = new Date().toLocaleTimeString()
    const result = `[${timestamp}] N=${matrix.length}: ` +
      allMinorDets.map(r => `det(−${r.i})=${r.det}`).join(', ')
    setSavedResults(prev => [...prev, result])
  }

  // SVG設定
  const scale = 35
  const height = Math.sqrt(3) / 2 * scale
  const padding = scale
  const svgWidth = GRID_SIZE * scale + padding * 2
  const svgHeight = GRID_SIZE * height + padding * 2
  const originX = padding + (GRID_SIZE * scale) / 2
  const originY = padding + (GRID_SIZE * height) / 2

  const getTrianglePath = (x: number, y: number, isUp: boolean): string => {
    const baseX = originX + x * scale / 2
    const baseY = originY - y * height

    if (isUp) {
      return `M ${baseX - scale/2} ${baseY + height/2} L ${baseX} ${baseY - height/2} L ${baseX + scale/2} ${baseY + height/2} Z`
    } else {
      return `M ${baseX - scale/2} ${baseY - height/2} L ${baseX + scale/2} ${baseY - height/2} L ${baseX} ${baseY + height/2} Z`
    }
  }

  // 8x8範囲の三角形生成
  const triangles: { x: number; y: number; isUp: boolean }[] = []
  for (let y = -4; y <= 4; y++) {
    for (let x = -8; x <= 8; x++) {
      const isUp = (x + y) % 2 === 0
      triangles.push({ x, y, isUp })
    }
  }

  const jsonOutput = JSON.stringify(generateJSON(), null, 2)

  return (
    <div className="app">
      <div className="main-content">
        <h1>Triangle Lattice Painter</h1>

        <div className="controls">
          <div className="legend">
            {[0, 1, 2, 3].map(i => (
              <span key={i} className="legend-item">
                <span className={`color-box ${COLOR_NAMES[i]}`}></span>
                {COLOR_NAMES[i]}
              </span>
            ))}
          </div>
          <button onClick={handleClear}>クリア</button>
          <button onClick={handleSaveShape} disabled={colors.size === 0}>
            輪郭を保存
          </button>
          <button onClick={handleRandomize} disabled={isSearching}>
            ランダム
          </button>
          {!isSearching ? (
            <button onClick={handleSearch} className="search-btn">
              非ゼロdet探索
            </button>
          ) : (
            <button onClick={handleStopSearch} className="stop-btn">
              停止
            </button>
          )}
        </div>

        {(searchStatus || shape.length > 0) && (
          <div className="status">
            {shape.length > 0 && <span className="shape-info">輪郭: {shape.length}個</span>}
            {searchStatus && <span className="search-status">{searchStatus}</span>}
          </div>
        )}

        <div className="canvas-container">
          <svg width={svgWidth} height={svgHeight} className="canvas">
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
            <circle cx={originX} cy={originY} r={3} fill="red" />
            <text x={originX + 6} y={originY + 4} fill="red" fontSize="10">O</text>
          </svg>
        </div>

        <p className="info">塗られた三角形: {colors.size}個</p>
      </div>

      <div className="side-panel">
        <div className="json-section">
          <h3>JSON出力</h3>
          <textarea readOnly value={jsonOutput} rows={8} />
        </div>

        <div className="json-section">
          <h3>JSON入力</h3>
          <textarea
            value={jsonInput}
            onChange={e => setJsonInput(e.target.value)}
            rows={5}
            placeholder="JSONを貼り付け..."
          />
          <button onClick={handleJsonImport}>インポート</button>
        </div>

        <div className="matrix-section">
          <h3>グラフ行列 (N={matrix.length})</h3>
          {matrix.length > 0 ? (
            <>
              <div className="matrix-container">
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
                  <div key={i} className="label">{label}</div>
                ))}
              </div>

              {allMinorDets.length > 0 && (
                <div className="det-section">
                  <h4>小行列式 (i行i列除去)</h4>
                  <table className="det-table">
                    <thead>
                      <tr>
                        <th>i</th>
                        <th>det</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allMinorDets.map(({ i, det }) => (
                        <tr key={i}>
                          <td>{i}</td>
                          <td>{det}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button onClick={handleSaveResults}>結果を保存</button>
                </div>
              )}
            </>
          ) : (
            <p className="empty">三角形を塗ってください</p>
          )}
        </div>

        <div className="saved-section">
          <h3>保存された結果</h3>
          {savedResults.length > 0 ? (
            <ul>
              {savedResults.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          ) : (
            <p className="empty">なし</p>
          )}
          {savedResults.length > 0 && (
            <button onClick={() => setSavedResults([])}>クリア</button>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
