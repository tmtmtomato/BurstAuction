// ===============================================
// 1. 定数と変数の定義
// ===============================================

// DOM要素の取得
const gameContainer = document.getElementById('game-container');
const playerHandElement = document.getElementById('player-hand');
const playerUsedCardsElement = document.getElementById('player-used-cards');
const playerAcquiredCardsElement = document.getElementById('player-acquired-cards');
const playerScoreElement = document.getElementById('player-score');

const cpuAreaElement = document.getElementById('cpu-area');
const cpuHandCountElement = document.getElementById('cpu-hand-count');
const cpuUsedCardsElement = document.getElementById('cpu-used-cards');
const cpuAcquiredCardsElement = document.getElementById('cpu-acquired-cards');
const cpuScoreElement = document.getElementById('cpu-score');

const deckPileElement = document.getElementById('deck-pile');
const deckCountElement = document.getElementById('deck-count');
const bidTargetCardElement = document.getElementById('bid-target-card');
const playerBidCardsElement = document.getElementById('player-bid-cards');
const cpuBidCardsElement = document.getElementById('cpu-bid-cards');

const messageElement = document.getElementById('message-area');
const confirmButton = document.getElementById('confirm-button');
const restartButton = document.getElementById('restart-button');

// カードの定義
const SUITS = { S: '♠', H: '♥', C: '♣', D: '♦' };
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// ゲームの状態を管理する変数
let deck = [];
let playerHand = [];
let cpuHand = [];
let playerUsed = [];
let cpuUsed = [];
let playerAcquired = [];
let cpuAcquired = [];
let playerBid = [];
let selectedCards = [];
let cpuBid = [];
let bidTarget = null;
let isAnimating = false;
let activeAnimations = 0;
let turnCount = 0;
let cpuDifficulty = 'normal'; // ★追加: CPUの難易度を管理 (デフォルトは中級)
let audioContext;

// ===============================================
// 2. カード関連のヘルパー関数
// ===============================================

function getCardValue(rank) {
    if (rank === 'A') return 1;
    if (rank === 'J') return 11;
    if (rank === 'Q') return 12;
    if (rank === 'K') return 13;
    return parseInt(rank);
}

function createCardElement(card, isBack = false) {
    const cardEl = document.createElement('div');
    if (isBack) {
        cardEl.className = `card card-back`;
        cardEl.innerHTML = `◆`;
    } else {
        cardEl.className = `card suit-${card.suit}`;
        cardEl.innerHTML = `
            <span class="rank">${card.rank}</span>
            <span class="suit">${SUITS[card.suit]}</span>
        `;
        cardEl.dataset.card = `${card.suit}${card.rank}`;
    }
    return cardEl;
}
// ★★★ ロック管理の司令塔（改） ★★★
function setAnimationState(isStarting) {
    if (isStarting) {
        activeAnimations++;
    } else {
        if (activeAnimations > 0) activeAnimations--;
    }
    isAnimating = activeAnimations > 0;
    
    // isAnimatingフラグに応じてUIの状態を制御する
    if (isAnimating) {
        playerHandElement.classList.add('locked');
    } else {
        playerHandElement.classList.remove('locked');
    }
    updateConfirmButton(); // ボタンの状態もここで一括管理
}

function animateCardMove(startEl, endEl, cardData, isBack = false) {
    playSound('deal', 0.1, 0.2);

    return new Promise(resolve => {
        setAnimationState(true);
        // ...関数の残りの部分は変更なし...
        const startRect = startEl.getBoundingClientRect();
        const endRect = endEl.getBoundingClientRect();
        const containerRect = gameContainer.getBoundingClientRect();
        const movingCard = createCardElement(cardData, isBack);
        movingCard.classList.add('moving-card');
        movingCard.style.top = `${startRect.top - containerRect.top}px`;
        movingCard.style.left = `${startRect.left - containerRect.left}px`;
        gameContainer.appendChild(movingCard);
        if (startEl.classList) {
             startEl.classList.add('card-hidden');
        }
        requestAnimationFrame(() => {
            const dx = endRect.left - startRect.left + (endRect.width - startRect.width) / 2;
            const dy = endRect.top - startRect.top + (endRect.height - startRect.height) / 2;
            movingCard.style.transform = `translate(${dx}px, ${dy}px)`;
        });
        const timeoutId = setTimeout(() => {
            console.warn("Animation timed out. Forcefully completing.", movingCard);
            completeAnimation();
        }, 700);
        const completeAnimation = () => {
            clearTimeout(timeoutId);
            movingCard.remove();
            if (document.body.contains(startEl)) {
                startEl.classList.remove('card-hidden');
            }
            setAnimationState(false);
            resolve();
        };
        movingCard.addEventListener('transitionend', completeAnimation, { once: true });
    });
}

// ===============================================
// ★★★ サウンド関連ヘルパー (新規追加) ★★★
// ===============================================
// オーディオコンテキストを初期化する関数
function initAudio() {
    if (!audioContext) {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.error("Web Audio API is not supported in this browser");
        }
    }
}
// シンプルな音を再生する汎用関数
function playSound(type, duration = 0.1, volume = 0.5) {
    // ★★★ 防御的プログラミングの導入 (try...catch) ★★★
    try {
        if (!audioContext) return;

        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        gainNode.gain.setValueAtTime(volume, audioContext.currentTime);

        switch (type) {
            case 'click':
                oscillator.type = 'triangle';
                oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
                break;
            case 'deal':
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration * 2);
                duration *= 2;
                break;
            case 'win':
                oscillator.type = 'triangle';
                oscillator.frequency.setValueAtTime(523, audioContext.currentTime);
                oscillator.frequency.linearRampToValueAtTime(1046, audioContext.currentTime + duration);
                gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
                break;
        }

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + duration);
    } catch (e) {
        // サウンドでエラーが起きても、ゲームは止めない。コンソールにエラー内容を報告するだけ。
        console.error("Error playing sound:", type, e);
    }
}
// ★★★ 勝利のファンファーレを再生する専用関数 (新規追加) ★★★
function playVictoryJingle() {
    try {
        if (!audioContext) return;

        // ド(C4), ミ(E4), ソ(G4), 高いド(C5) の周波数を定義
        const notes = [
            { freq: 261.63, duration: 0.15, delay: 0.0 },  // ド
            { freq: 329.63, duration: 0.15, delay: 0.15 }, // ミ
            { freq: 392.00, duration: 0.15, delay: 0.30 }, // ソ
            { freq: 523.25, duration: 0.30, delay: 0.45 }  // 高いド (少し長めに)
        ];

        const initialVolume = 0.3;
        const startTime = audioContext.currentTime;

        notes.forEach(note => {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.type = 'triangle'; // 三角波はピコピコしたゲーム音に合う
            oscillator.frequency.setValueAtTime(note.freq, startTime + note.delay);

            gainNode.gain.setValueAtTime(initialVolume, startTime + note.delay);
            // 音の終わり際にスッと消えるように設定
            gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + note.delay + note.duration);

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.start(startTime + note.delay);
            oscillator.stop(startTime + note.delay + note.duration);
        });

    } catch (e) {
        console.error("Error playing victory jingle:", e);
    }
}
// ★★★ 敗北のジングルを再生する専用関数 (新規追加) ★★★
function playDefeatJingle() {
    try {
        if (!audioContext) return;

        // ソ(G4), ミ(E4), ド(C4) の下降するメロディ
        const notes = [
            { freq: 392.00, duration: 0.2, delay: 0.0 },  // ソ
            { freq: 329.63, duration: 0.2, delay: 0.2 }, // ミ
            { freq: 261.63, duration: 0.4, delay: 0.4 }  // ド (少し長く、終止感)
        ];

        const initialVolume = 0.25; // 勝利時より少し控えめな音量
        const startTime = audioContext.currentTime;

        notes.forEach(note => {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.type = 'sine'; // サイン波はより柔らかく、物悲しい音色
            oscillator.frequency.setValueAtTime(note.freq, startTime + note.delay);

            gainNode.gain.setValueAtTime(initialVolume, startTime + note.delay);
            gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + note.delay + note.duration);

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.start(startTime + note.delay);
            oscillator.stop(startTime + note.delay + note.duration);
        });

    } catch (e) {
        console.error("Error playing defeat jingle:", e);
    }
}
// ===============================================
// 3. ゲームの初期化処理
// ===============================================
function initializeGame() {
    // ★★★ ゲーム開始前に、選択されている難易度を読み込む ★★★
    const selectedDifficulty = document.querySelector('input[name="difficulty"]:checked').value;
    cpuDifficulty = selectedDifficulty;
    console.log(`ゲーム開始。CPUの難易度: 「${cpuDifficulty}」`);
    // ★★★ 難易度セレクターを有効化する（次のゲームのため）★★★
    document.querySelectorAll('input[name="difficulty"]').forEach(radio => radio.disabled = false);

    turnCount = 0;  // ターンをリセット
    activeAnimations = 0; // カウンターをリセット
    setAnimationState(false); // UIのロックを完全に解除
    
    const allCards = [];
    for (const suit in SUITS) {
        for (const rank of RANKS) {
            allCards.push({ suit: suit, rank: rank, value: getCardValue(rank) });
        }
    }
    playerHand = allCards.filter(c => c.suit === 'H');
    cpuHand = allCards.filter(c => c.suit === 'S');
    deck = allCards.filter(c => c.suit === 'D');
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    playerUsed = []; cpuUsed = []; playerAcquired = []; cpuAcquired = [];
    playerBid = []; cpuBid = []; bidTarget = null;
    playerBidCardsElement.innerHTML = '';
    cpuBidCardsElement.innerHTML = '';
    startTurn();
}

// ===============================================
// 4. 画面描画処理
// ===============================================
function render() {
    playerHandElement.innerHTML = '';
    playerHand.sort((a,b) => a.value - b.value).forEach(card => {
        const cardEl = createCardElement(card);
        if (selectedCards.includes(cardEl.dataset.card)) {
            cardEl.classList.add('selected');
        }
        cardEl.addEventListener('click', () => onCardClick(cardEl.dataset.card));
        playerHandElement.appendChild(cardEl);
    });
    renderCardList(playerUsedCardsElement, playerUsed);
    renderCardList(playerAcquiredCardsElement, playerAcquired);
    playerScoreElement.textContent = calculateScore(playerAcquired);
    cpuHandCountElement.textContent = cpuHand.length;
    renderCardList(cpuUsedCardsElement, cpuUsed);
    renderCardList(cpuAcquiredCardsElement, cpuAcquired);
    cpuScoreElement.textContent = calculateScore(cpuAcquired);
    deckCountElement.textContent = deck.length;
    deckPileElement.style.display = deck.length > 0 ? 'flex' : 'none';
    bidTargetCardElement.innerHTML = '';
    if (bidTarget) {
        bidTargetCardElement.appendChild(createCardElement(bidTarget));
    }
}
function renderCardList(element, cards) {
    element.innerHTML = '';
    cards.sort((a,b) => a.value - b.value).forEach(card => element.appendChild(createCardElement(card)));
}
function calculateScore(cards) {
    return cards.reduce((sum, card) => sum + card.value, 0);
}

// ===============================================
// 5. ゲーム進行のロジック
// ===============================================
async function startTurn() {
    // ターンをインクリメント
    turnCount++;

    // デッキが0枚になるまでターン進行
    if (deck.length > 0) {
        const nextCard = deck[deck.length - 1];
        await animateCardMove(deckPileElement, bidTargetCardElement, nextCard);
        bidTarget = deck.pop();

        if (turnCount === 1) {
            messageElement.textContent = 'あなたの番です。入札するカードを1枚または2枚選んでください。';
        } else {
            messageElement.textContent = 'あなたの番です。入札するカードを選んでください。';
        }
        
        render();
        updateConfirmButton();
    } else {
        checkGameOver();
    }
}

// ===============================================
// 6. プレイヤーのアクション関連
// ===============================================
function onCardClick(cardId) {
    if (isAnimating) return;
    // initAudio(); // ← ★★★ この行を削除 ★★★
    playSound('click', 0.05, 0.3);

    const index = selectedCards.indexOf(cardId);
    // ...関数の残りの部分は変更なし...
    if (index > -1) {
        selectedCards.splice(index, 1);
    } else {
        if (selectedCards.length < 2) {
            selectedCards.push(cardId);
        }
    }
    render();
    updateConfirmButton();
}

function updateConfirmButton() {
    confirmButton.disabled = selectedCards.length === 0 || isAnimating;
}

async function onConfirmClick() {
    if (selectedCards.length === 0 || isAnimating) return;
    // ★★★ 最初の入札時に難易度セレクターをロックする ★★★
    if (turnCount === 1) {
        document.querySelectorAll('input[name="difficulty"]').forEach(radio => radio.disabled = true);
    }
    const bidPromises = [];
    const cardElementsToMove = Array.from(playerHandElement.querySelectorAll('.selected'));
    cardElementsToMove.forEach(cardEl => {
        const cardId = cardEl.dataset.card;
        const cardData = playerHand.find(c => `${c.suit}${c.rank}` === cardId);
        if(cardData){
            bidPromises.push(animateCardMove(cardEl, playerBidCardsElement, cardData));
        }
    });
    
    await Promise.all(bidPromises); // これで全てのアニメーションが終わるのを待つ

    // アニメーションが終わったので、状態を更新
    playerBid = playerHand.filter(card => selectedCards.includes(`${card.suit}${card.rank}`));
    playerHand = playerHand.filter(card => !selectedCards.includes(`${card.suit}${card.rank}`));
    
    renderCardList(playerBidCardsElement, playerBid);
    
    selectedCards = [];
    render(); 
    updateConfirmButton(); // ここでボタンが無効化される

    messageElement.textContent = 'CPUが考えています...';

    setTimeout(cpuTurn, 1000);
}

async function cpuTurn() {
    // --- 思考ロジックの分岐 ---
    // --- 思考ロジックの分岐 ---
    switch (cpuDifficulty) {
        case 'easy':
            cpuBid = cpuTurn_easy();
            break;
        case 'hard':
            cpuBid = cpuTurn_hard();
            break;
        case 'special': // ★追加: 特級へのルート
            cpuBid = cpuTurn_special();
            break;
        case 'normal':
        default:
            cpuBid = cpuTurn_normal();
            break;
    }
    
    // --- 共通の入札処理 ---
    const bidPromises = [];
    cpuBid.forEach(cardData => {
        bidPromises.push(animateCardMove(cpuAreaElement, cpuBidCardsElement, cardData, true));
    });
    await Promise.all(bidPromises);
    
    cpuBid.forEach(bidCard => {
        const index = cpuHand.findIndex(handCard => handCard.rank === bidCard.rank && handCard.suit === bidCard.suit);
        if (index > -1) cpuHand.splice(index, 1);
    });
    resolveBid();
}

// ★★★ 初級CPUの思考 (新規追加) ★★★
function cpuTurn_easy() {
    console.log("CPU思考 (初級): ランダムに行動します。");
    const hand = [...cpuHand]; // 手札のコピーを作成
    hand.sort(() => Math.random() - 0.5); // 手札をランダムにシャッフル

    if (hand.length === 0) return [];
    
    // 70%の確率で1枚、30%の確率で2枚出す
    if (Math.random() < 0.7 || hand.length < 2) {
        return [hand[0]]; // ランダムに1枚
    } else {
        return [hand[0], hand[1]]; // ランダムに2枚
    }
}

// ★★★ 中級CPUの思考 (既存ロジックを関数化) ★★★
function cpuTurn_normal() {
    console.log("CPU思考 (中級): 状況に応じて行動します。");
    const targetCard = bidTarget;
    const currentCpuScore = calculateScore(cpuAcquired);
    const potentialTotalScore = currentCpuScore + targetCard.value;
    cpuHand.sort((a, b) => b.value - a.value); // 強い順にソート
    
    let bid;
    if (potentialTotalScore === 21) {
        bid = cpuHand.length >= 2 ? [cpuHand[0], cpuHand[1]] : [cpuHand[0]];
    } else if (potentialTotalScore > 21) {
        bid = [cpuHand[cpuHand.length - 1]];
    } else {
        if (targetCard.value >= 8 && cpuHand.length >= 2) {
            const card1 = cpuHand[0];
            const card2 = cpuHand.find(c => c.value > 5 && c !== card1);
            bid = card2 ? [card1, card2] : [cpuHand[0]];
        } else {
            bid = [cpuHand[cpuHand.length - 1]];
        }
    }
    return bid;
}

// ★★★ 上級CPUの思考 (新規追加) ★★★
function cpuTurn_hard() {
    console.log("CPU思考 (上級): 温存戦略を取ります。");
    const targetCard = bidTarget;
    const pScore = calculateScore(playerAcquired);
    const cScore = calculateScore(cpuAcquired);
    const potentialTotalScore = cScore + targetCard.value;
    
    // --- 温存するカードを定義 ---
    const preservedRanks = ['A', '2', 'Q', 'K'];
    
    // --- 状況判断 ---
    const isCriticalPhase = (pScore > 15 || cScore > 15 || deck.length < 4);
    
    // 手札を「温存カード」と「通常カード」に分ける
    let preservedHand = cpuHand.filter(c => preservedRanks.includes(c.rank));
    let normalHand = cpuHand.filter(c => !preservedRanks.includes(c.rank));
    
    // 弱い順にソートしておく
    preservedHand.sort((a,b) => a.value - b.value);
    normalHand.sort((a,b) => a.value - b.value);

    let bid = [];

    // --- 思考ロジック ---

    // 1. 【絶対勝利】取れば21点になるなら、最強の手で取りに行く (温存無視)
    if (potentialTotalScore === 21) {
        console.log("CPU (上級): 勝利確定！全力投球。");
        cpuHand.sort((a, b) => b.value - a.value); // 全手札を強い順に
        return cpuHand.length >= 2 ? [cpuHand[0], cpuHand[1]] : [cpuHand[0]];
    }
    
    // 2. 【絶対回避】取ればバーストするなら、最弱の手で捨てる
    if (potentialTotalScore > 21) {
        console.log("CPU (上級): バースト回避。最弱カードを捨てる。");
        // 通常カードがあればそれを、なければ温存カードから最弱を出す
        return normalHand.length > 0 ? [normalHand[0]] : [preservedHand[0]];
    }
    
    // 3. 【通常フェーズ】勝敗に直結しない場面
    if (!isCriticalPhase) {
        console.log("CPU (上級): まだ序盤。通常カードで様子見。");
        // 通常カードがあれば最弱を1枚、なければ仕方なく温存カードの最弱を1枚出す
        return normalHand.length > 0 ? [normalHand[0]] : [preservedHand[0]];
    }
    
    // 4. 【終盤フェーズ】勝敗に直結する場面
    if (isCriticalPhase) {
        console.log("CPU (上級): 終盤戦。少し強めに勝負する。");
        // 価値の高いカード(8以上)なら、通常カードの最強で取りに行く
        if (targetCard.value >= 8 && normalHand.length > 0) {
            return [normalHand[normalHand.length - 1]]; // 通常カードの最強
        } else {
            // それ以外は、通常カードの最弱で様子見
             return normalHand.length > 0 ? [normalHand[0]] : [preservedHand[0]];
        }
    }
    
    // 万が一、どの条件にも合致しない場合（基本的には起こらない）
    return [cpuHand[cpuHand.length - 1]];
}
// ★★★★★ 特級CPUの思考 (新規追加) ★★★★★
function cpuTurn_special() {
    console.log("CPU思考 (特級): 貴様の全てを読み切る…");
    const targetCard = bidTarget;

    // --- プレイヤーとCPU、両方の状態を完全に把握 ---
    const pScore = calculateScore(playerAcquired);
    const cScore = calculateScore(cpuAcquired);
    const playerPotentialScore = pScore + targetCard.value;
    const cpuPotentialScore = cScore + targetCard.value;
    
    // 手札を強い順と弱い順にソートしたリストを用意
    const strongHand = [...cpuHand].sort((a, b) => b.value - a.value);
    const weakHand = [...cpuHand].sort((a, b) => a.value - b.value);

    // ==================================================
    //  特級思考1: プレイヤーの危機的状況への介入ロジック
    // ==================================================

    // 1. 【勝利阻止】このカードでプレイヤーが21点になるなら、全力で阻止する
    if (playerPotentialScore === 21) {
        console.log("CPU (特級): 貴様の勝利は阻止する！全力で叩き潰す！");
        // 自分がバーストしない限り、最強の手を出す
        if (cpuPotentialScore <= 21) {
            return strongHand.length >= 2 ? [strongHand[0], strongHand[1]] : [strongHand[0]];
        }
    }

    // 2. 【敗北誘導】このカードでプレイヤーがバーストするなら、喜んで譲る
    if (playerPotentialScore > 21) {
        console.log("CPU (特級): そのカード、貴様にくれてやろう…バーストするがいい！");
        return [weakHand[0]]; // 確実に負けるために最弱の1枚を出す
    }

    // ==================================================
    //  特級思考2: 自身の状況に基づく、上級AIの行動ロジック
    // ==================================================
    // (ここから下は、基本的に上級AIのロジックと同じだが、常にプレイヤーの状況を考慮する)

    const preservedRanks = ['A', '2', 'Q', 'K'];
    const isCriticalPhase = (pScore > 15 || cScore > 15 || deck.length < 4);
    let preservedHand = cpuHand.filter(c => preservedRanks.includes(c.rank));
    let normalHand = cpuHand.filter(c => !preservedRanks.includes(c.rank));
    preservedHand.sort((a,b) => a.value - b.value);
    normalHand.sort((a,b) => a.value - b.value);

    // 3. 【自己の絶対勝利】取れば自分が21点になるなら、最強の手で取りに行く
    if (cpuPotentialScore === 21) {
        console.log("CPU (特級): 我が勝利の時だ。");
        return strongHand.length >= 2 ? [strongHand[0], strongHand[1]] : [strongHand[0]];
    }
    
    // 4. 【自己の絶対回避】取れば自分がバーストするなら、最弱の手で捨てる
    if (cpuPotentialScore > 21) {
        console.log("CPU (特級): フッ、このカードは不要だ。");
        return normalHand.length > 0 ? [normalHand[0]] : [preservedHand[0]];
    }
    
    // 5. 【通常 or 終盤フェーズ】
    if (!isCriticalPhase) {
        console.log("CPU (特級): まだだ…まだその時ではない…");
        return normalHand.length > 0 ? [normalHand[0]] : [preservedHand[0]];
    } else {
        console.log("CPU (特級): …仕掛けるか。");
        if (targetCard.value >= 8 && normalHand.length > 0) {
            return [normalHand[normalHand.length - 1]];
        } else {
             return normalHand.length > 0 ? [normalHand[0]] : [preservedHand[0]];
        }
    }
    
    // 万が一のフォールバック
    return [weakHand[0]];
}

async function resolveBid() {
    const playerScore = calculateScore(playerBid);
    const cpuScore = calculateScore(cpuBid);
    renderCardList(playerBidCardsElement, playerBid);
    renderCardList(cpuBidCardsElement, cpuBid);
    let winnerMessage = '';
    let winner = null;
    if (playerScore > cpuScore) {
        winnerMessage = `あなた(${playerScore}) vs CPU(${cpuScore}) で、あなたの勝ち！`;
        winner = 'player';
        playSound('win', 0.2, 0.4); // ★追加: 勝利音
    } else if (cpuScore > playerScore) {
        winnerMessage = `あなた(${playerScore}) vs CPU(${cpuScore}) で、CPUの勝ち！`;
        winner = 'cpu';
        // 敗北音は今は鳴らさない
    } else {
        winnerMessage = `引き分け！(${playerScore}) カードは流れます。`;
        winner = 'draw';
    }
    // ...関数の残りの部分は変更なし...
    messageElement.textContent = winnerMessage;
    await new Promise(resolve => setTimeout(resolve, 2000));
    const movePromises = [];
    const playerBidElements = Array.from(playerBidCardsElement.children);
    playerBid.forEach((card, i) => {
        if(playerBidElements[i]) movePromises.push(animateCardMove(playerBidElements[i], playerUsedCardsElement, card));
    });
    const cpuBidElements = Array.from(cpuBidCardsElement.children);
    cpuBid.forEach((card, i) => {
        if(cpuBidElements[i]) movePromises.push(animateCardMove(cpuBidElements[i], cpuUsedCardsElement, card));
    });
    const bidTargetEl = bidTargetCardElement.firstElementChild;
    if(bidTargetEl){
        if (winner === 'player') {
            movePromises.push(animateCardMove(bidTargetEl, playerAcquiredCardsElement, bidTarget));
        } else if (winner === 'cpu') {
            movePromises.push(animateCardMove(bidTargetEl, cpuAcquiredCardsElement, bidTarget));
        } else {
            bidTargetEl.style.transition = 'transform 0.5s ease-in, opacity 0.5s ease-in';
            bidTargetEl.style.transform = 'translateY(200px)';
            bidTargetEl.style.opacity = '0';
        }
    }
    await Promise.all(movePromises);
    if (winner === 'player') playerAcquired.push(bidTarget);
    if (winner === 'cpu') cpuAcquired.push(bidTarget);
    playerUsed.push(...playerBid);
    cpuUsed.push(...cpuBid);
    playerBid = [];
    cpuBid = [];
    playerBidCardsElement.innerHTML = '';
    cpuBidCardsElement.innerHTML = '';
    render();
    checkGameOver();
}

function checkGameOver() {
    const pScore = calculateScore(playerAcquired);
    const cScore = calculateScore(cpuAcquired);
    let gameOver = false;
    let finalMessage = '';
    let gameResult = null; // ★追加: 'win', 'lose', 'draw' を管理する状態変数

    if (pScore === 21) {
        gameOver = true;
        finalMessage = '21点ぴったり！あなたの勝利です！';
        gameResult = 'win'; // ★明確に「勝利」と設定
    } else if (cScore === 21) {
        gameOver = true;
        finalMessage = 'CPUが21点！CPUの勝利です！';
        gameResult = 'lose'; // ★明確に「敗北」と設定
    } else if (pScore > 21) {
        gameOver = true;
        finalMessage = 'バースト！CPUの勝利です！';
        gameResult = 'lose'; // ★明確に「敗北」と設定
    } else if (cScore > 21) {
        gameOver = true;
        finalMessage = 'CPUがバースト！あなたの勝利です！';
        gameResult = 'win'; // ★明確に「勝利」と設定
    } else if (deck.length === 0) {
        gameOver = true;
        if (pScore > cScore) {
            finalMessage = `山札切れ！得点が高いあなたの勝利です！(${pScore} vs ${cScore})`;
            gameResult = 'win'; // ★明確に「勝利」と設定
        } else if (cScore > pScore) {
            finalMessage = `山札切れ！得点が高いCPUの勝利です！(${pScore} vs ${cScore})`;
            gameResult = 'lose'; // ★明確に「敗北」と設定
        } else {
            finalMessage = `山札切れ！引き分けです！(${pScore} vs ${cScore})`;
            gameResult = 'draw'; // ★明確に「引き分け」と設定
        }
    }
    
    if (gameOver) {
        // ★★★ 結果に応じて、シンプルにジングルを再生 ★★★
        if (gameResult === 'win') {
            playVictoryJingle();
        } else if (gameResult === 'lose') {
            playDefeatJingle();
        }
        // 'draw' の場合は何も鳴らさない

        messageElement.textContent = finalMessage;
        confirmButton.style.display = 'none';
        restartButton.style.display = 'block';
    } else {
        startTurn();
    }
}
// ===============================================
// 7. イベントリスナーの設定
// ===============================================
confirmButton.addEventListener('click', onConfirmClick);
restartButton.addEventListener('click', () => {
    confirmButton.style.display = 'block';
    restartButton.style.display = 'none';
    initializeGame();
});
// ★★★ オーディオ初期化のためのグローバルリスナー (新規追加) ★★★
function initializeAudioOnFirstInteraction() {
    initAudio();
    // 一度実行されたら、このリスナーは不要なので削除する
    document.body.removeEventListener('click', initializeAudioOnFirstInteraction);
    document.body.removeEventListener('touchend', initializeAudioOnFirstInteraction);
}
document.body.addEventListener('click', initializeAudioOnFirstInteraction);
document.body.addEventListener('touchend', initializeAudioOnFirstInteraction); // スマホにも対応

// ★★★ 難易度選択のイベントリスナー (新規追加) ★★★
const difficultyRadios = document.querySelectorAll('input[name="difficulty"]');
difficultyRadios.forEach(radio => {
    radio.addEventListener('change', (event) => {
        cpuDifficulty = event.target.value;
        console.log(`CPUの難易度を「${cpuDifficulty}」に変更しました。`);
    });
});

// ===============================================
// 8. ゲーム開始
// ===============================================
initializeGame();