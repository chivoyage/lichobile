import { Capacitor } from '@capacitor/core'
import { AiRoundInterface } from '../shared/round'
import { StockfishPlugin, getNbCores, getMaxMemory } from '../../stockfish'

export default class Engine {
  private level = 1
  private stockfish: StockfishPlugin
  private isInit = false
  private listener: (e: Event) => void

  constructor(readonly ctrl: AiRoundInterface, readonly variant: VariantKey) {
    this.listener = (e: Event) => {
      const line = (e as any).output
      console.debug('[stockfish >>] ' + line)
      const bmMatch = line.match(/^bestmove (\w{4,5})|^bestmove ([PNBRQ]@\w{2})/)
      if (bmMatch) {
        if (bmMatch[1]) this.ctrl.onEngineMove(bmMatch[1])
        else if (bmMatch[2]) this.ctrl.onEngineDrop(bmMatch[2])
      }
    }
    this.stockfish = new StockfishPlugin(variant)
  }

  public async init(): Promise<void> {
    try {
      if (!this.isInit) {
        await this.stockfish.start()
        this.isInit = true
        window.addEventListener('stockfish', this.listener, { passive: true })
        await this.stockfish.setVariant()
        await this.stockfish.setOption('Threads', getNbCores())
        const mem = await getMaxMemory()
        if (Capacitor.platform !== 'web') {
          await this.stockfish.setOption('Hash', mem)
        }
        await this.newGame()
      }
    } catch (e) {
      console.error(e)
    }
  }

  public async newGame(): Promise<void> {
    // from UCI protocol spec, the client should always send isready after
    // ucinewgame
    await this.stockfish.send('ucinewgame')
    await this.stockfish.isReady()
    await this.stockfish.setOption('UCI_AnalyseMode', false)
    await this.stockfish.setOption('UCI_LimitStrength', true)
  }

  public async search(initialFen: string, moves: string): Promise<void> {
    // console.info('engine search pos: ', `position fen ${initialFen} moves ${moves}`)
    await this.stockfish.send(`position fen ${initialFen} moves ${moves}`)
    await this.stockfish.send(`go movetime ${moveTime(this.level)} depth ${depth(this.level)}`)
  }

  public async setLevel(l: number): Promise<void> {
    this.level = l
    return Capacitor.platform === 'ios' || Capacitor.platform === 'android' ?
      this.stockfish.setOption('UCI_Elo', elo(this.level)) :
      this.stockfish.setOption('Skill Level', String(skill(this.level)))
  }

  public async exit(): Promise<void> {
    window.removeEventListener('stockfish', this.listener, false)
    return this.stockfish.exit()
  }
}

const maxMoveTime = 5000
const maxSkill = 20
const levelToDepth: Record<number, number> = {
  1: 5,
  2: 5,
  3: 5,
  4: 5,
  5: 5,
  6: 8,
  7: 13,
  8: 22
}
const eloTable: Record<number, number> = {
  1: 1350,
  2: 1500,
  3: 1600,
  4: 1700,
  5: 2000,
  6: 2300,
  7: 2700,
  8: 2850,
}

function elo(level: number) {
  return String(eloTable[level])
}

function moveTime(level: number) {
  return level * maxMoveTime / 8
}

function skill(level: number) {
  return Math.round((level - 1) * (maxSkill / 7))
}

function depth(level: number) {
  return levelToDepth[level]
}
