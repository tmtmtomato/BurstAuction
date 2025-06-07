document.addEventListener('DOMContentLoaded', () => {

    // ===============================================
    // 0. Firebase との接続設定
    // ===============================================
    const firebaseConfig = {
      apiKey: "AIzaSyCN6PQjRHDzs73E7eLS240S3--0l1Aet84",
      authDomain: "burstaucution-friendbattle.firebaseapp.com",
      projectId: "burstaucution-friendbattle",
      storageBucket: "burstaucution-friendbattle.appspot.com",
      messagingSenderId: "985333817452",
      appId: "1:985333817452:web:c0d7d5a910d3ad66997849",
      measurementId: "G-ZT0DFHV46G",
      databaseURL: "https://burstaucution-friendbattle-default-rtdb.firebaseio.com"
    };
    const app = firebase.initializeApp(firebaseConfig);
    const database = firebase.database();

    // ===============================================
    // 1. 定数と変数の定義
    // ===============================================

    // [A] スクリーン要素
    const modeSelectionScreen = document.getElementById('mode-selection-screen');
    const roomScreen = document.getElementById('room-screen');
    const gameContainer = document.getElementById('game-container');
    // [B] UIコントロール要素
    const soloPlayButton = document.getElementById('solo-play-button');
    const multiPlayButton = document.getElementById('multi-play-button');
    const createRoomButton = document.getElementById('create-room-button');
    const joinRoomButton = document.getElementById('join-room-button');
    const roomIdInput = document.getElementById('room-id-input');
    const backToModeSelectionButton = document.getElementById('back-to-mode-selection-button');
    const confirmButton = document.getElementById('confirm-button');
    const restartButton = document.getElementById('restart-button');
    const difficultyRadios = document.querySelectorAll('input[name="difficulty"]');
    // [C] ゲーム表示要素
    const playerHandElement = document.getElementById('player-hand');
    const playerUsedCardsElement = document.getElementById('player-used-cards');
    const playerAcquiredCardsElement = document.getElementById('player-acquired-cards');
    const playerScoreElement = document.getElementById('player-score');
    const playerBidCardsElement = document.getElementById('player-bid-cards');
    const cpuAreaElement = document.getElementById('cpu-area');
    const cpuHandCountElement = document.getElementById('cpu-hand-count');
    const cpuUsedCardsElement = document.getElementById('cpu-used-cards');
    const cpuAcquiredCardsElement = document.getElementById('cpu-acquired-cards');
    const cpuScoreElement = document.getElementById('cpu-score');
    const cpuBidCardsElement = document.getElementById('cpu-bid-cards');
    const deckPileElement = document.getElementById('deck-pile');
    const deckCountElement = document.getElementById('deck-count');
    const bidTargetCardElement = document.getElementById('bid-target-card');
    const messageElement = document.getElementById('message-area');
    const roomMessageElement = document.getElementById('room-message');
    const multiplayerRoomInfoElement = document.getElementById('multiplayer-room-info');

    const SUITS = { S: '♠', H: '♥', C: '♣', D: '♦' };
    const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

    let deck = [], playerHand = [], cpuHand = [], playerUsed = [], cpuUsed = [], playerAcquired = [], cpuAcquired = [], playerBid = [], cpuBid = [], selectedCards = [], bidTarget = null;
    let isAnimating = false, activeAnimations = 0, turnCount = 0, gameMode = 'solo', cpuDifficulty = 'normal', audioContext;
    let currentRoomId = null, localPlayerId = null, gameRef = null, gameStateListener = null;

     // ===============================================
    //  ヘルパー関数、進行ロジックなど
    // ===============================================

    // --- カード・計算・描画ヘルパー ---
    /**
     * カードのランク（'A', 'K', '5'など）を数値に変換します。
     * @param {string} rank - カードのランク ('A', '2', ..., 'K')
     * @returns {number} - ランクに対応する数値 (A=1, J=11, Q=12, K=13)
     */
    function getCardValue(rank) {
        if (rank === 'A') return 1;
        if (rank === 'J') return 11;
        if (rank === 'Q') return 12;
        if (rank === 'K') return 13;
        // 上記以外（'2'～'10'）は、文字列をそのまま数値に変換
        return parseInt(rank, 10);
    }

    /**
     * カードのデータから、表示用のHTML要素を生成します。
     * @param {object} card - カードオブジェクト { suit, rank, value }
     * @param {boolean} [isBack=false] - trueの場合、カードの裏面を生成
     * @returns {HTMLElement} - 生成されたカードのdiv要素
     */
    function createCardElement(card, isBack = false) {
        const cardEl = document.createElement('div');

        if (isBack) {
            // カードの裏面を作成する場合
            cardEl.className = `card card-back`;
            cardEl.innerHTML = `◆`;
        } else {
            // カードの表面を作成する場合
            cardEl.className = `card suit-${card.suit}`;
            cardEl.innerHTML = `<span class="rank">${card.rank}</span><span class="suit">${SUITS[card.suit]}</span>`;
            // クリックなどの識別のために、カード情報をdata属性として埋め込む
            cardEl.dataset.card = `${card.suit}${card.rank}`;
        }
        return cardEl;
    }

    /**
     * カードの配列を受け取り、その合計得点を計算します。
     * @param {Array<object>} cards - カードオブジェクトの配列
     * @returns {number} - 合計得点
     */
    function calculateScore(cards) {
        // reduceを使い、配列の各カードのvalueを合計する
        return cards.reduce((sum, card) => sum + card.value, 0);
    }

    /**
     * 指定されたHTML要素の中に、カードリストを描画します。
     * @param {HTMLElement} element - 描画先の親要素 (例: player-hand)
     * @param {Array<object>} cards - 描画するカードオブジェクトの配列
     */
    function renderCardList(element, cards) {
        // 描画前に、一度中身を空にしてリセットする
        element.innerHTML = '';

        // cardsがnullやundefinedでなく、ちゃんと配列の場合のみ処理を実行
        if (cards && Array.isArray(cards)) {
            cards
                // (1) プレースホルダー（rankが"none"のダミーデータ）を除外する
                .filter(card => card.rank !== "none")
                // (2) カードの数値(value)が小さい順に並べ替える
                .sort((a, b) => a.value - b.value)
                // (3) 並べ替えた後の各カードについて、HTML要素を生成して追加する
                .forEach(card => {
                    const cardElement = createCardElement(card);
                    element.appendChild(cardElement);
                });
        }
    }
    /**
     * 指定されたHTML要素の中に、指定された枚数だけカードの裏面を描画します。
     * @param {HTMLElement} element - 描画先の親要素
     * @param {number} count - 描画するカードの枚数
     */
    function renderCardBacks(element, count) {
        element.innerHTML = '';
        for (let i = 0; i < count; i++) {
            // isBack=true で裏面カードを生成
            const cardElement = createCardElement({}, true); 
            element.appendChild(cardElement);
        }
    }

    // --- アニメーション・サウンドヘルパー ---
    /**
     * アニメーションの実行状態を管理し、手札のロック状態やボタンの有効/無効を更新します。
     * @param {boolean} isStarting - trueの場合、アニメーションが開始したことを記録。falseの場合、終了したことを記録。
     */
    function setAnimationState(isStarting) {
        // 実行中のアニメーション数を増減させる
        if (isStarting) {
            activeAnimations++;
        } else {
            if (activeAnimations > 0) {
                activeAnimations--;
            }
        }

        // 1つでもアニメーションが実行中なら、isAnimatingフラグをtrueにする
        isAnimating = activeAnimations > 0;

        // アニメーション中はプレイヤーの手札を操作不能にする（lockedクラスを付与）
        if (isAnimating) {
            playerHandElement.classList.add('locked');
        } else {
            playerHandElement.classList.remove('locked');
        }
        
        // ボタンの状態を更新する
        updateConfirmButton();
    }


    /**
     * カードが指定した場所へ移動するアニメーションを再生します。
     * @param {HTMLElement} startEl - アニメーションの開始地点となる要素
     * @param {HTMLElement} endEl - アニメーションの終了地点となる要素
     * @param {object} cardData - 移動するカードのデータ { suit, rank, value }
     * @param {boolean} [isBack=false] - trueの場合、カードの裏面で移動させる
     * @returns {Promise} - アニメーションが完了したときに解決されるPromise
     */
    function animateCardMove(startEl, endEl, cardData, isBack = false) {
        // カード移動の効果音を再生
        playSound('deal', 0.1, 0.2);
        
        // Promiseを返すことで、呼び出し元でアニメーション完了を待つことができる (await animateCardMove(...))
        return new Promise(resolve => {
            // 1. アニメーション開始を通知
            setAnimationState(true);

            // 2. 開始地点と終了地点の座標を取得
            const startRect = startEl.getBoundingClientRect();
            const endRect = endEl.getBoundingClientRect();
            const containerRect = gameContainer.getBoundingClientRect(); // 親コンテナの座標

            // 3. アニメーションで動かすためのダミーカードを生成
            const movingCard = createCardElement(cardData, isBack);
            movingCard.classList.add('moving-card');

            // 4. ダミーカードを、開始地点の真上に配置
            movingCard.style.position = 'absolute'; // CSSでの制御のため
            movingCard.style.top = `${startRect.top - containerRect.top}px`;
            movingCard.style.left = `${startRect.left - containerRect.left}px`;
            gameContainer.appendChild(movingCard);

            // 5. 元のカードを一時的に非表示にする
            if (startEl.classList) {
                startEl.classList.add('card-hidden');
            }

            // 6. 描画が更新された次のフレームで、移動先へtransform(移動)させる
            requestAnimationFrame(() => {
                const dx = endRect.left - startRect.left + (endRect.width - startRect.width) / 2;
                const dy = endRect.top - startRect.top + (endRect.height - startRect.height) / 2;
                movingCard.style.transform = `translate(${dx}px, ${dy}px)`;
            });

            // 7. アニメーション完了処理を定義
            const completeAnimation = () => {
                clearTimeout(timeoutId); // 保険のタイマーを解除
                movingCard.remove(); // ダミーカードを削除
                // 元のカードがまだ存在すれば、非表示を解除
                if (document.body.contains(startEl)) {
                    startEl.classList.remove('card-hidden');
                }
                setAnimationState(false); // アニメーション終了を通知
                resolve(); // Promiseを解決し、待機していた処理を再開させる
            };

            // 8. アニメーション完了のイベントリスナーを設定
            // transitionend: CSSのtransitionが完了した時に一度だけ発火する
            movingCard.addEventListener('transitionend', completeAnimation, { once: true });

            // 9. (保険) ネットワーク遅延などでtransitionendが発火しない場合に備え、一定時間後に強制的に完了させる
            const timeoutId = setTimeout(() => {
                console.warn("Animation fallback timer triggered.");
                completeAnimation();
            }, 700); // 700ms (CSSのtransition時間より少し長め)
        });
    }


    /**
     * Web Audio APIの初期化を行います。
     * ユーザーがページを操作（クリックなど）した最初のタイミングで呼び出す必要があります。
     */
    function initAudio() {
        // audioContextがまだ作成されていなければ作成する
        if (!audioContext) {
            try {
                // 主要ブラウザと古いSafariなどに対応
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
            } catch (e) {
                console.error("Web Audio API is not supported in this browser");
            }
        }
    }
    /**
     * 指定された種類の効果音を再生します。
     * @param {string} type - 再生する音の種類 ('click', 'deal', 'win')
     * @param {number} [duration=0.1] - 音の長さ（秒）
     * @param {number} [volume=0.5] - 音量 (0.0 ~ 1.0)
     */
    function playSound(type, duration = 0.1, volume = 0.5) {
        try {
            // audioContextが初期化されていない場合は何もしない
            if (!audioContext) return;

            // 1. 音源(Oscillator)と音量調整(GainNode)を準備
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            // 2. 初期音量を設定
            gainNode.gain.setValueAtTime(volume, audioContext.currentTime);

            // 3. 音の種類に応じて、音の波形や周波数を設定
            switch (type) {
                case 'click':
                    oscillator.type = 'triangle'; // 三角波（ピコッという感じの音）
                    oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // 周波数(Hz) ラの音(A5)
                    // 音が鳴り終わるまでに、音量を徐々に0にする
                    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
                    break;

                case 'deal':
                    oscillator.type = 'sine'; // 正弦波（ポーンという澄んだ音）
                    oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // 周波数(Hz) ラの音(A4)
                    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration * 2);
                    duration *= 2; // dealの音は少し長めに
                    break;

                case 'win':
                    oscillator.type = 'triangle';
                    oscillator.frequency.setValueAtTime(523, audioContext.currentTime); // ドの音(C5)
                    // 時間と共に周波数を上げて、上昇感を出す
                    oscillator.frequency.linearRampToValueAtTime(1046, audioContext.currentTime + duration);
                    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
                    break;
            }

            // 4. 音源 → 音量調整 → 出力先(スピーカー) の順に接続
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            // 5. 音の再生を開始し、指定した時間後に停止する
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + duration);

        } catch (e) {
            console.error("Error playing sound:", type, e);
        }
    }

    /**
     * 勝利時のジングル（短い音楽）を再生します。
     */
    function playVictoryJingle() {
        try {
            if (!audioContext) return;

            // 再生する音符のリスト（ド・ミ・ソ・ド↑）
            const notes = [
                { freq: 261.63, duration: 0.15, delay: 0.0 },  // C4
                { freq: 329.63, duration: 0.15, delay: 0.15 }, // E4
                { freq: 392.00, duration: 0.15, delay: 0.30 }, // G4
                { freq: 523.25, duration: 0.30, delay: 0.45 }  // C5 (長め)
            ];
            const initialVolume = 0.3;
            const startTime = audioContext.currentTime;

            // 各音符を順番に再生するよう予約する
            notes.forEach(note => {
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();

                oscillator.type = 'triangle';
                // 指定されたdelay後に、指定された周波数(freq)で音を鳴らし始める
                oscillator.frequency.setValueAtTime(note.freq, startTime + note.delay);
                gainNode.gain.setValueAtTime(initialVolume, startTime + note.delay);
                // 音が鳴り終わるまでに音量を0にする
                gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + note.delay + note.duration);

                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);

                // 再生開始と停止を予約
                oscillator.start(startTime + note.delay);
                oscillator.stop(startTime + note.delay + note.duration);
            });
        } catch (e) {
            console.error("Error playing victory jingle:", e);
        }
    }

    /**
     * 敗北時のジングルを再生します。
     */
    function playDefeatJingle() {
        try {
            if (!audioContext) return;
            
            // 再生する音符のリスト（ソ・ミ・ド↓）
            const notes = [
                { freq: 392.00, duration: 0.2, delay: 0.0 },  // G4
                { freq: 329.63, duration: 0.2, delay: 0.2 },  // E4
                { freq: 261.63, duration: 0.4, delay: 0.4 }   // C4 (長め)
            ];
            const initialVolume = 0.25;
            const startTime = audioContext.currentTime;
            
            notes.forEach(note => {
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                
                oscillator.type = 'sine'; // 悲しい感じなので正弦波に
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

    // --- ソロプレイ用：画面描画エンジン ---
    /**
     * ソロプレイモードのゲーム画面全体を、現在の変数（playerHand, cpuHandなど）の状態に基づいて再描画します。
     */
    function render() {
        // --- あなた（プレイヤー）エリアの描画 ---

        // プレイヤーの手札を描画
        playerHandElement.innerHTML = ''; // 一旦リセット
        playerHand
            .sort((a, b) => a.value - b.value) // カードを数字順に並び替え
            .forEach(card => {
                const cardEl = createCardElement(card);
                // 選択中のカードには 'selected' クラスを付与する
                if (selectedCards.includes(cardEl.dataset.card)) {
                    cardEl.classList.add('selected');
                }
                // 各カードにクリックイベントを設定
                cardEl.addEventListener('click', () => onCardClick(cardEl.dataset.card));
                playerHandElement.appendChild(cardEl);
            });

        // プレイヤーの使用済み・獲得カード・スコアを描画
        renderCardList(playerUsedCardsElement, playerUsed);
        renderCardList(playerAcquiredCardsElement, playerAcquired);
        playerScoreElement.textContent = calculateScore(playerAcquired);


        // --- CPUエリアの描画 ---

        // CPUの手札枚数・使用済み・獲得カード・スコアを描画
        cpuHandCountElement.textContent = cpuHand.length;
        renderCardList(cpuUsedCardsElement, cpuUsed);
        renderCardList(cpuAcquiredCardsElement, cpuAcquired);
        cpuScoreElement.textContent = calculateScore(cpuAcquired);


        // --- フィールドエリアの描画 ---

        // 山札の残り枚数を表示（山札が0枚になったら非表示にする）
        deckCountElement.textContent = deck.length;
        deckPileElement.style.display = deck.length > 0 ? 'flex' : 'none';

        // 競りの対象カードを描画
        bidTargetCardElement.innerHTML = ''; // 一旦リセット
        if (bidTarget) {
            bidTargetCardElement.appendChild(createCardElement(bidTarget));
        }
    }
    // ===============================================
    // 2-2. 対人戦用ヘルパー関数 (改訂版)
    // ===============================================
    /* 対戦部屋用の4桁のランダムな数字を生成します。*/
    function generateRoomId() {
        // Math.random() は 0以上1未満の小数を返す
        // 1. Math.random() * 9000  => 0 以上 9000 未満の小数 (例: 8999.99...)
        // 2. 1000 を足す           => 1000 以上 19000 未満の小数 (例: 1000.0 ～ 9999.99...)
        // 3. Math.floor() で小数点以下を切り捨て => 1000 ～ 9999 の整数
        const randomNumber = Math.floor(1000 + Math.random() * 9000);
        
        // 4. toString() で数値を文字列に変換して返す
        return randomNumber.toString();
    }

    /**
     * 対人戦用の新しい部屋を作成し、Firebaseに初期状態を保存します。
     */
    function createRoom() {
        roomMessageElement.textContent = '部屋を作成しています...';
        
        // 1. 部屋とプレイヤーのIDを準備
        const roomId = generateRoomId();
        const playerId = 'player1'; // 部屋を作成した人がプレイヤー1

        // 2. 山札と各プレイヤーの手札を準備
        const initialDeck = createInitialDeck();
        const { player1Hand, player2Hand, deck: remainingDeck } = dealInitialHands(initialDeck);

        // 3. Firebaseに保存するゲームの初期状態を定義
        // 注意: Firebase Realtime Databaseは空の配列を保存しないため、
        //       空のリストにはプレースホルダー（ダミーデータ）を入れておく。
        const placeholder = { rank: "none", suit: "N", value: 0 };

        const initialGameState = {
            roomId: roomId,
            players: {
                player1: { name: 'プレイヤー1', score: 0, isConnected: true },
                player2: { name: 'プレイヤー2', score: 0, isConnected: false }
            },
            turn: 'player1',
            phase: 'waiting',
            message: '対戦相手の参加を待っています...',
            deck: remainingDeck,
            hands: { player1: player1Hand, player2: player2Hand },
            // プレースホルダーを初期値として設定
            bids: { player1: [placeholder], player2: [placeholder] },
            usedCards: { player1: [placeholder], player2: [placeholder] },
            acquiredCards: { player1: [placeholder], player2: [placeholder] },
            bidTarget: null, // 競り対象は最初は無し
        };

        // 4. Firebaseの'rooms/(部屋番号)'というパスに初期状態を書き込む
        const newGameRef = database.ref('rooms/' + roomId);
        newGameRef.set(initialGameState)
            .then(() => {
                // 書き込みが成功したら、コンソールにログを出し、部屋に入る
                console.log(`部屋[${roomId}]の作成に成功しました。`);
                enterRoom(roomId, playerId);
            })
            .catch(error => {
                // 書き込みが失敗したら、エラーログを出す
                console.error("部屋の作成に失敗しました:", error);
                roomMessageElement.textContent = `部屋の作成に失敗しました。`;
            });
    }

    async function enterRoom(roomId, playerId) {
        currentRoomId = roomId;
        localPlayerId = playerId;
        sessionStorage.setItem('burstAuctionRoomId', roomId);
        sessionStorage.setItem('burstAuctionPlayerId', playerId);
        gameRef = database.ref('rooms/' + roomId);
        gameMode = 'multi';
        selectedCards = [];

        // 接続が確立したら、切断時の処理を予約する
        const playerRef = gameRef.child('players/' + playerId);
        await playerRef.child('isConnected').set(true); // 自分が接続したことをまず設定
        
        // onDisconnectを使って、接続が切れたら isConnected を false にするよう予約
        playerRef.child('isConnected').onDisconnect().set(false);
        // (おまけ) メッセージも更新するよう予約しておくと親切、なのだがplayersがここでは定義されてなくて使えない。要修正。
        //gameRef.child('message').onDisconnect().set(`${players[playerId].name}の接続が切れました...`);

        showScreen('game');
        startRealtimeListener();
    }

    function startRealtimeListener() {
        if (gameStateListener) { gameRef.off('value', gameStateListener); }
        gameStateListener = gameRef.on('value', (snapshot) => {
            if (snapshot.exists()) {
                const gameState = snapshot.val();
                if (gameState && gameState.players) {
                    window.gameState = gameState; 
                    renderMultiplayerGame(gameState);
    
                    // ★★★★★ここからロジックを全面的に変更★★★★★
    
                    // 【役割分担】
                    // 'bidding'フェーズの仕事：入札が揃ったら'reveal'フェーズに変えること
                    if (gameState.phase === 'bidding') {
                        const p1Bid = gameState.bids.player1.filter(c => c.rank !== "none");
                        const p2Bid = gameState.bids.player2.filter(c => c.rank !== "none");
                        const p1Hand = gameState.hands.player1 || [];
                        const p2Hand = gameState.hands.player2 || [];
                        const isP1HandEmpty = p1Hand.length === 0 || p1Hand[0].rank === 'none';
                        const isP2HandEmpty = p2Hand.length === 0 || p2Hand[0].rank === 'none';
                        
                        const shouldReveal = (p1Bid.length > 0 && p2Bid.length > 0) ||
                                             (p1Bid.length > 0 && isP2HandEmpty) ||
                                             (p2Bid.length > 0 && isP1HandEmpty);
    
                        if (shouldReveal && localPlayerId === 'player1') {
                            // 'reveal'フェーズに移行させる
                            gameRef.update({
                                phase: 'reveal',
                                message: 'いざ、勝負！'
                            });
                        }
                    }
                    
                    // 'reveal'フェーズの仕事：少し待ってから勝敗判定を呼び出すこと
                    if (gameState.phase === 'reveal' && localPlayerId === 'player1') {
                        // 重複実行を防ぐため、一度だけタイマーをセットする
                        if (!window.revealTimer) {
                            window.revealTimer = setTimeout(() => {
                                resolveMultiplayerBid(gameState);
                                window.revealTimer = null; // タイマーをリセット
                            }, 1500); // 1.5秒待つ
                        }
                    }
                    // ★★★★★ここまで変更★★★★★
                }
            } else {
                alert("部屋が閉じられました。");
                leaveRoom();
            }
        });
    }
    

    // ★★★ 改訂：部屋から退出する処理 ★★★
    function leaveRoom() {
        // 予約していたonDisconnect処理をキャンセルする
        if (gameRef && localPlayerId) {
            const playerRef = gameRef.child('players/' + localPlayerId);
            playerRef.child('isConnected').onDisconnect().cancel(); // 予約キャンセル
            playerRef.child('isConnected').set(false); // 正常に退出したことを能動的に通知
        }
        
        if (gameRef && gameStateListener) {
            gameRef.off('value', gameStateListener);
        }
        // ローカルの状態をリセット
        currentRoomId = null;
        localPlayerId = null;
        gameRef = null;
        gameStateListener = null;
        selectedCards = []; 
        
        showScreen('mode-selection');
    }

    function createInitialDeck() {
        const allCards = [];
        for (const suit in SUITS) {
            for (const rank of RANKS) {
                allCards.push({ suit: suit, rank: rank, value: getCardValue(rank) });
            }
        }
        let deckCards = allCards.filter(c => c.suit === 'D');
        // ★★★ここから変更★★★
        let heartCards = allCards.filter(c => c.suit === 'H');
        let spadeCards = allCards.filter(c => c.suit === 'S');
    
        // 山札だけシャッフルする
        for (let i = deckCards.length - 1; i > 0; i--) { 
            const j = Math.floor(Math.random() * (i + 1));
            [deckCards[i], deckCards[j]] = [deckCards[j], deckCards[i]];
        }
        // 山札と手札候補を両方シャッフルする。拡張機能用のコード
        //for (let i = deckCards.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deckCards[i], deckCards[j]] = [deckCards[j], deckCards[i]]; }
        
        // 分けた手札をそのまま返す
        return { deckCards, heartCards, spadeCards };
    }

    function dealInitialHands(initialDeck) {
        // 手札シャッフルして配るパターン。拡張機能用のコード
        // const player1Hand = initialDeck.handCards.slice(0, 13);
        // const player2Hand = initialDeck.handCards.slice(13, 26);
        //return {
        //    player1Hand: player1Hand,
        //    player2Hand: player2Hand,
        //    deck: initialDeck.deckCards // ← deckCards配列をそのまま返す
        //};
        return {
            player1Hand: initialDeck.heartCards,  // Player1にはハートを
            player2Hand: initialDeck.spadeCards,  // Player2にはスペードを
            deck: initialDeck.deckCards
        };
    }

    // ===============================================
    // 4-2. 対人戦モード専用の描画エンジン
    // ===============================================

    // --- 対人戦用：画面描画エンジン ---
    function renderMultiplayerGame(gameState) {
        // ★★★ 戦略的デバッグログ① ★★★
        console.log("renderMultiplayerGameが呼び出されました。受け取ったgameStateはこちら↓");
        console.log(gameState);

        // --- 1. 必要な変数をすべて定義する ---
        const myPlayerId = localPlayerId;
        if (!myPlayerId) {
            console.error("デバッグ: myPlayerId が見つかりません！");
            return;
        }
    
        const { players, turn, phase, message, deck, bidTarget, bids, hands, usedCards, acquiredCards, roomId } = gameState;

        // ★★★ 戦略的デバッグログ② ★★★
        console.log("デバッグ: playersオブジェクトの中身:", players);

        if (!players || !hands || !usedCards || !acquiredCards || !bids) { 
            console.log("players：",players)
            console.log("hands：",hands)
            console.log("usedCards：",usedCards)
            console.log("acquiredCards：",acquiredCards)
            console.log("bids：",bids)
            console.error("デバッグ: players または hands が gameState に存在しません！");
            return; 
        }
    
        const opponentId = myPlayerId === 'player1' ? 'player2' : 'player1';
        
        // ★ me と opponent を先に定義します
        const me = players[myPlayerId];
        const opponent = players[opponentId];
        // ★★★ 戦略的デバッグログ③ ★★★
        console.log("デバッグ: me:", me, " | opponent:", opponent);
        
        // ★ me と opponent が存在するかチェックします
        if (!me || !opponent) {    
            console.error("デバッグ: 自分(me) または 相手(opponent) のオブジェクトが作れませんでした。");
            return; 
        }

        // ★★★ 戦略的デバッグログ④ ★★★
        console.log("デバッグ: 変数定義は正常に完了しました。これから画面描画を開始します。");
    
        // ★ 描画に必要な他のデータも変数に入れておきます
        const myHandData = hands[myPlayerId] || [];
        const myUsedData = usedCards[myPlayerId] || [];
        const myAcquiredData = acquiredCards[myPlayerId] || [];
        const myBidData = bids[myPlayerId] || [];
        const opponentUsedData = usedCards[opponentId] || [];
        const opponentAcquiredData = acquiredCards[opponentId] || [];
        const opponentBidData = bids[opponentId] || [];
    
        // --- 2. 変数がすべて揃ったので、UIの見た目を調整する ---
        // ★ opponent 変数が使えるようになったので、ここで名前を表示します
        document.querySelector('#cpu-area h2').textContent = opponent.name + (opponent.isConnected ? '' : ' (接続待機中)');
        document.getElementById('difficulty-selector').style.display = 'none';
        restartButton.style.display = 'block';
    
        // --- 3. データを使って画面全体を描画する ---
        playerScoreElement.textContent = calculateScore(myAcquiredData); // myAcquiredData を使用
        playerHandElement.innerHTML = '';
        myHandData.forEach(card => { // myHandData を使用
            const cardEl = createCardElement(card);
            const cardId = card.suit + card.rank;
            if (selectedCards.includes(cardId)) { cardEl.classList.add('selected'); }
            playerHandElement.appendChild(cardEl);
        });
    
        renderCardList(playerUsedCardsElement, myUsedData);
        renderCardList(playerAcquiredCardsElement, myAcquiredData);
        renderCardList(playerBidCardsElement, myBidData);
    
        cpuScoreElement.textContent = calculateScore(opponentAcquiredData);
        cpuHandCountElement.textContent = hands[opponentId] ? hands[opponentId].length : 0;
        renderCardList(cpuUsedCardsElement, opponentUsedData);
        renderCardList(cpuAcquiredCardsElement, opponentAcquiredData);
        // 相手の入札カードの描画ロジック
        // 自分のターンで、かつ bidding フェーズ中は、相手の入札を「裏面」で表示する
        if (phase === 'bidding' && turn === myPlayerId) {
            // プレースホルダーを除いた、実際の入札枚数をカウント
            const opponentBidCount = opponentBidData.filter(c => c.rank !== "none").length;
            renderCardBacks(cpuBidCardsElement, opponentBidCount);
        } else {
            // それ以外の状況（公開フェーズや、相手のターンなど）では「表面」を表示する
            renderCardList(cpuBidCardsElement, opponentBidData);
        }
    
        deckCountElement.textContent = deck ? Object.keys(deck).length : 0;
        bidTargetCardElement.innerHTML = '';
        if (bidTarget) { 
            bidTargetCardElement.appendChild(createCardElement(bidTarget));
        }
        messageElement.textContent = message;
    
        // --- 4. 最後にターン制御などを行う ---
        const isMyTurn = turn === myPlayerId && phase === 'bidding';
        playerHandElement.classList.toggle('locked', !isMyTurn);
        updateConfirmButton();
    
        if (multiplayerRoomInfoElement) { multiplayerRoomInfoElement.textContent = `部屋番号: ${roomId}`; }
    }

    // --- ゲーム進行ロジック ---
    function initializeGame() {
        const selectedDifficulty = document.querySelector('input[name="difficulty"]:checked').value;
        cpuDifficulty = selectedDifficulty;
        console.log(`ゲーム開始。CPUの難易度: 「${cpuDifficulty}」`);
        difficultyRadios.forEach(radio => radio.disabled = false);
        turnCount = 0;
        activeAnimations = 0;
        setAnimationState(false);
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
        playerUsed = [];
        cpuUsed = [];
        playerAcquired = [];
        cpuAcquired = [];
        playerBid = [];
        cpuBid = [];
        bidTarget = null;
        playerBidCardsElement.innerHTML = '';
        cpuBidCardsElement.innerHTML = '';
        startTurn();
    }

    async function startTurn() {
        turnCount++;
        if (deck.length > 0) {
            const nextCard = deck[deck.length - 1];
            await animateCardMove(deckPileElement, bidTargetCardElement, nextCard);
            bidTarget = deck.pop();
            render();
            if (playerHand.length === 0) {
                messageElement.textContent = "あなたの手札がありません。自動的にパスします。";
                playerBid = [];
                setTimeout(progressTurn, 1500);
            } else {
                if (turnCount === 1) {
                    messageElement.textContent = 'あなたの番です。入札するカードを1枚または2枚選んでください。';
                } else {
                    messageElement.textContent = 'あなたの番です。入札するカードを選んでください。';
                }
                updateConfirmButton();
            }
        } else {
            checkGameOver();
        }
    }

    async function progressTurn() {
        messageElement.textContent = 'CPUが考えています...';
        await new Promise(resolve => setTimeout(resolve, 1000));
        await cpuTurn();
        await resolveBid();
    }

    async function resolveBid() {
        if (gameMode === 'multi') return;

        const playerScore = calculateScore(playerBid);
        const cpuScore = calculateScore(cpuBid);
        renderCardList(playerBidCardsElement, playerBid);
        renderCardList(cpuBidCardsElement, cpuBid);
        let winnerMessage = '';
        let winner = null;
        if (playerScore > cpuScore) {
            winnerMessage = `あなた(${playerScore}) vs CPU(${cpuScore}) で、あなたの勝ち！`;
            winner = 'player';
            playSound('win', 0.2, 0.4);
        } else if (cpuScore > playerScore) {
            winnerMessage = `あなた(${playerScore}) vs CPU(${cpuScore}) で、CPUの勝ち！`;
            winner = 'cpu';
        } else {
            winnerMessage = `引き分け！(${playerScore}) カードは流れます。`;
            winner = 'draw';
        }
        messageElement.textContent = winnerMessage;
        await new Promise(resolve => setTimeout(resolve, 2000));
        const movePromises = [];
        const playerBidElements = Array.from(playerBidCardsElement.children);
        playerBid.forEach((card, i) => {
            if (playerBidElements[i]) movePromises.push(animateCardMove(playerBidElements[i], playerUsedCardsElement, card));
        });
        const cpuBidElements = Array.from(cpuBidCardsElement.children);
        cpuBid.forEach((card, i) => {
            if (cpuBidElements[i]) movePromises.push(animateCardMove(cpuBidElements[i], cpuUsedCardsElement, card));
        });
        const bidTargetEl = bidTargetCardElement.firstElementChild;
        if (bidTargetEl) {
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
        if (gameMode === 'multi') return;
        
        const pScore = calculateScore(playerAcquired);
        const cScore = calculateScore(cpuAcquired);
        let gameOver = false;
        let finalMessage = '';
        let gameResult = null;
        if (playerHand.length === 0 && cpuHand.length === 0) {
            gameOver = true;
            finalMessage = '両者の手札が尽きました！スコアで勝負！';
            if (pScore > cScore) {
                finalMessage += ` 得点が高いあなたの勝利です！(${pScore} vs ${cScore})`;
                gameResult = 'win';
            } else if (cScore > pScore) {
                finalMessage += ` 得点が高いCPUの勝利です！(${pScore} vs ${cScore})`;
                gameResult = 'lose';
            } else {
                finalMessage += ` 引き分けです！(${pScore} vs ${cScore})`;
                gameResult = 'draw';
            }
        } else if (pScore === 21) {
            gameOver = true;
            finalMessage = '21点ぴったり！あなたの勝利です！';
            gameResult = 'win';
        } else if (cScore === 21) {
            gameOver = true;
            finalMessage = 'CPUが21点！CPUの勝利です！';
            gameResult = 'lose';
        } else if (pScore > 21) {
            gameOver = true;
            finalMessage = 'バースト！CPUの勝利です！';
            gameResult = 'lose';
        } else if (cScore > 21) {
            gameOver = true;
            finalMessage = 'CPUがバースト！あなたの勝利です！';
            gameResult = 'win';
        } else if (deck.length === 0) {
            gameOver = true;
            finalMessage = '山札切れ！スコアで勝負！';
            if (pScore > cScore) {
                finalMessage += ` 得点が高いあなたの勝利です！(${pScore} vs ${cScore})`;
                gameResult = 'win';
            } else if (cScore > pScore) {
                finalMessage += ` 得点が高いCPUの勝利です！(${pScore} vs ${cScore})`;
                gameResult = 'lose';
            } else {
                finalMessage += ` 引き分けです！(${pScore} vs ${cScore})`;
                gameResult = 'draw';
            }
        }
        if (gameOver) {
            if (gameResult === 'win') {
                playVictoryJingle();
            } else if (gameResult === 'lose') {
                playDefeatJingle();
            }
            messageElement.textContent = finalMessage;
            confirmButton.style.display = 'none';
            restartButton.style.display = 'block';
        } else {
            startTurn();
        }
    }
    async function resolveMultiplayerBid(currentState) {
        console.log("勝敗判定ロジック実行中...");
    
        // 判定処理が重複して走らないように、phaseを'resolving'（判定中）に更新する
        // これでもしplayer2も判定処理を呼んでしまっても、ここでブロックされる
        if (currentState.phase !== 'bidding') {
            console.log("すでに判定処理が実行されているため、スキップします。");
            return;
        }
        await gameRef.child('phase').set('resolving');
    
        // --- 1. スコア計算と勝者判定 ---
        const p1Bid = currentState.bids.player1.filter(c => c.rank !== "none");
        const p2Bid = currentState.bids.player2.filter(c => c.rank !== "none");
        const p1BidScore = calculateScore(p1Bid);
        const p2BidScore = calculateScore(p2Bid);
    
        let winnerId = null;
        let message = "";
        if (p1BidScore > p2BidScore) {
            winnerId = 'player1';
            message = `${currentState.players.player1.name}の勝利！(${p1BidScore} vs ${p2BidScore})`;
        } else if (p2BidScore > p1BidScore) {
            winnerId = 'player2';
            message = `${currentState.players.player2.name}の勝利！(${p1BidScore} vs ${p2BidScore})`;
        } else {
            winnerId = 'draw';
            message = `引き分け！(${p1BidScore}) カードは流れます。`;
        }
    
        // --- 2. データベース更新内容の準備 ---
        const updates = {};
        const placeholder = { rank: "none", suit: "N", value: 0 };
    
        // a. 勝者がいた場合、競り対象カードを獲得カードに追加
        if (winnerId !== 'draw') {
            // currentStateから最新の獲得カードリストを取得し、新しいカードを追加
            const winnerAcquired = currentState.acquiredCards[winnerId].filter(c => c.rank !== "none");
            winnerAcquired.push(currentState.bidTarget);
            updates[`/acquiredCards/${winnerId}`] = winnerAcquired;
        }
        
        // b. 両者の入札カードを使用済みカードに移動
        const p1Used = currentState.usedCards.player1.filter(c => c.rank !== "none");
        updates['/usedCards/player1'] = [...p1Used, ...p1Bid];
        const p2Used = currentState.usedCards.player2.filter(c => c.rank !== "none");
        updates['/usedCards/player2'] = [...p2Used, ...p2Bid];
        
        // c. 両者の手札から入札したカードを削除
        const p1Hand = currentState.hands.player1.filter(card => !p1Bid.some(bidCard => bidCard.suit === card.suit && bidCard.rank === card.rank));
        updates['/hands/player1'] = p1Hand.length > 0 ? p1Hand : [placeholder];
        const p2Hand = currentState.hands.player2.filter(card => !p2Bid.some(bidCard => bidCard.suit === card.suit && bidCard.rank === card.rank));
        updates['/hands/player2'] = p2Hand.length > 0 ? p2Hand : [placeholder];
        
        // d. 入札エリアをリセット
        updates['/bids/player1'] = [placeholder];
        updates['/bids/player2'] = [placeholder];
        
        // e. 次の競り対象カードを山札から引く
        const nextDeck = currentState.deck;
        const nextBidTarget = nextDeck.length > 0 ? nextDeck.pop() : null;
        updates['/deck'] = nextDeck;
        updates['/bidTarget'] = nextBidTarget;
    
        // f. メッセージと次のターンの設定
        updates['/message'] = message + " ... 次のターンへ";
        
        // --- 3. データベースを一度に更新 ---
        await gameRef.update(updates);
    
        // --- 4. 少し待ってから、次のターンを開始する ---
        setTimeout(async () => {
            // --- ゲーム終了条件のチェック ---
            // ※注意：スコア計算は「更新後」のスコアで行う必要があるため、
            //         updatesオブジェクトから計算し直すのが確実。
            const p1AcquiredAfter = updates[`/acquiredCards/player1`] || currentState.acquiredCards.player1;
            const p2AcquiredAfter = updates[`/acquiredCards/player2`] || currentState.acquiredCards.player2;
            const p1Score = calculateScore(p1AcquiredAfter.filter(c => c.rank !== "none"));
            const p2Score = calculateScore(p2AcquiredAfter.filter(c => c.rank !== "none"));
        
            const p1HandAfter = updates['/hands/player1'];
            const p2HandAfter = updates['/hands/player2'];
            const isP1HandEmpty = !p1HandAfter || p1HandAfter[0].rank === 'none';
            const isP2HandEmpty = !p2HandAfter || p2HandAfter[0].rank === 'none';
        
            let gameOver = false;
            let finalMessage = "";
        
            // 終了条件を順番にチェック
            if (p1Score > 21) {
                gameOver = true;
                finalMessage = `${currentState.players.player1.name}がバースト！ ${currentState.players.player2.name}の勝利です！`;
            } else if (p2Score > 21) {
                gameOver = true;
                finalMessage = `${currentState.players.player2.name}がバースト！ ${currentState.players.player1.name}の勝利です！`;
            } else if (p1Score === 21) {
                gameOver = true;
                finalMessage = `${currentState.players.player1.name}が21点ぴったり！勝利です！`;
            } else if (p2Score === 21) {
                gameOver = true;
                finalMessage = `${currentState.players.player2.name}が21点ぴったり！勝利です！`;
            } else if (isP1HandEmpty && isP2HandEmpty) {
                gameOver = true;
                finalMessage = "両者の手札が尽きました！スコアで勝負！ ... ";
                if (p1Score > p2Score) finalMessage += `${currentState.players.player1.name}の勝利！ (${p1Score} vs ${p2Score})`;
                else if (p2Score > p1Score) finalMessage += `${currentState.players.player2.name}の勝利！ (${p2Score} vs ${p1Score})`;
                else finalMessage += `引き分け！ (${p1Score} vs ${p2Score})`;
            } else if (!updates['/bidTarget']) { // 次の競り対象カードがない（山札切れ）
                gameOver = true;
                finalMessage = "山札が切れました！スコアで勝負！ ... ";
                if (p1Score > p2Score) finalMessage += `${currentState.players.player1.name}の勝利！ (${p1Score} vs ${p2Score})`;
                else if (p2Score > p1Score) finalMessage += `${currentState.players.player2.name}の勝利！ (${p2Score} vs ${p1Score})`;
                else finalMessage += `引き分け！ (${p1Score} vs ${p2Score})`;
            }
        
            // --- 判定結果に応じてDBを更新 ---
            if (gameOver) {
                // ゲーム終了時の更新
                const finalUpdates = {
                    'phase': 'finished',
                    'message': finalMessage
                };
                await gameRef.update(finalUpdates);
            } else {
                // ゲーム続行時の更新
                const nextTurnUpdates = {
                    'phase': 'bidding',
                    // 'turn'と'message'は状況に応じて変える
                };
                // isP1HandEmpty, isP2HandEmpty はこのsetTimeoutの前に計算済み
                if (!isP1HandEmpty && !isP2HandEmpty) {
                    // 両者とも手札あり -> 通常通りP1のターン
                    nextTurnUpdates.turn = 'player1';
                    nextTurnUpdates.message = `${currentState.players.player1.name}の番です。入札するカードを選んでください。`;
                } else if (isP1HandEmpty && !isP2HandEmpty) {
                    // P1だけ手札なし -> P2のターン
                    nextTurnUpdates.turn = 'player2';
                    nextTurnUpdates.message = `${currentState.players.player1.name}の手札がないため、${currentState.players.player2.name}の番です。`;
                } else if (!isP1HandEmpty && isP2HandEmpty) {
                    // P2だけ手札なし -> P1のターン
                    nextTurnUpdates.turn = 'player1';
                    nextTurnUpdates.message = `${currentState.players.player2.name}の手札がないため、${currentState.players.player1.name}の番です。`;
                }
                // 両者の手札が0枚の場合は、gameOverのロジックで処理されるので、ここでは考慮不要

                await gameRef.update(nextTurnUpdates);
                // ★★★★★ここまで修正★★★★★
            }
        }, 2500); // 2.5秒待って結果を見せる
    }

    // ===============================================
    // 3. CPU思考ルーチン
    // ===============================================

    async function cpuTurn() {
        let bidCards = [];
        if (cpuHand.length > 0) {
            switch (cpuDifficulty) {
                case 'easy':    bidCards = cpuTurn_easy();    break;
                case 'hard':    bidCards = cpuTurn_hard();    break;
                case 'special': bidCards = cpuTurn_special(); break;
                case 'normal':
                default:        bidCards = cpuTurn_normal();  break;
            }
        } else {
            console.log("CPU: 手札が0枚のため、自動的にパスします。");
            messageElement.textContent = "CPUの手札がありません。CPUはパスします。";
        }

        cpuBid = [...bidCards];

        if (cpuBid.length > 0) {
            const bidPromises = cpuBid.map(cardData =>
                animateCardMove(cpuAreaElement, cpuBidCardsElement, cardData, true)
            );
            await Promise.all(bidPromises);
            
            cpuBid.forEach(bidCard => {
                const index = cpuHand.findIndex(handCard =>
                    handCard.rank === bidCard.rank && handCard.suit === bidCard.suit
                );
                if (index > -1) {
                    cpuHand.splice(index, 1);
                }
            });
        }
    }

    function cpuTurn_easy() {
        console.log("CPU思考 (初級): ランダムに行動します。");
        const hand = [...cpuHand].sort(() => Math.random() - 0.5);
        if (Math.random() < 0.7 || hand.length < 2) {
            return [hand[0]];
        } else {
            return [hand[0], hand[1]];
        }
    }

    function cpuTurn_normal() {
        console.log("CPU思考 (中級): 状況に応じて行動します。");
        const targetCard = bidTarget;
        const currentCpuScore = calculateScore(cpuAcquired);
        const potentialTotalScore = currentCpuScore + targetCard.value;
        const strongHand = [...cpuHand].sort((a, b) => b.value - a.value);
        const weakHand = [...cpuHand].sort((a, b) => a.value - b.value);

        if (potentialTotalScore === 21) {
            return strongHand.length >= 2 ? [strongHand[0], strongHand[1]] : [strongHand[0]];
        }
        if (potentialTotalScore > 21) {
            return [weakHand[0]];
        }
        if (targetCard.value >= 8 && strongHand.length >= 2) {
            const card1 = strongHand[0];
            const card2 = strongHand.find(c => c.value > 5 && c !== card1);
            return card2 ? [card1, card2] : [strongHand[0]];
        }
        return [weakHand[0]];
    }

    function cpuTurn_hard() {
        console.log("CPU思考 (上級): 温存戦略を取ります。");
        const targetCard = bidTarget;
        const pScore = calculateScore(playerAcquired);
        const cScore = calculateScore(cpuAcquired);
        const potentialTotalScore = cScore + targetCard.value;

        const preservedRanks = ['A', '2', 'Q', 'K'];
        const strongHand = [...cpuHand].sort((a, b) => b.value - a.value);
        const weakHand = [...cpuHand].sort((a, b) => a.value - b.value);
        const normalHand = weakHand.filter(c => !preservedRanks.includes(c.rank));

        if (potentialTotalScore === 21) {
            return strongHand.length >= 2 ? [strongHand[0], strongHand[1]] : [strongHand[0]];
        }
        if (potentialTotalScore > 21) {
            return normalHand.length > 0 ? [normalHand[0]] : [weakHand[0]];
        }

        const isCriticalPhase = (pScore > 15 || cScore > 15 || deck.length < 4);
        if (!isCriticalPhase) {
            return normalHand.length > 0 ? [normalHand[0]] : [weakHand[0]];
        } else {
            if (targetCard.value >= 8 && normalHand.length > 0) {
                return [normalHand[normalHand.length - 1]];
            } else {
                return normalHand.length > 0 ? [normalHand[0]] : [weakHand[0]];
            }
        }
    }

    function cpuTurn_special() {
        console.log("CPU思考 (特級): 貴様の全てを読み切る…");
        const targetCard = bidTarget;
        const pScore = calculateScore(playerAcquired);
        const cScore = calculateScore(cpuAcquired);
        const playerPotentialScore = pScore + targetCard.value;
        const cpuPotentialScore = cScore + targetCard.value;
    
        const strongHand = [...cpuHand].sort((a, b) => b.value - a.value);
        const weakHand = [...cpuHand].sort((a, b) => a.value - b.value); 
    
        // --- 思考の優先順位 1: 致命的な状況への介入 ---
        if (playerPotentialScore === 21 && cpuPotentialScore <= 21) {
            console.log("CPU (特級): [介入] プレイヤーの勝利は阻止する！");
            return strongHand.length >= 2 ? [strongHand[0], strongHand[1]] : [strongHand[0]];
        }
        if (playerPotentialScore > 21) {
            console.log("CPU (特級): [介入] プレイヤーのバーストを誘う！");
            return [weakHand[0]];
        }
        if (cpuPotentialScore === 21) {
            console.log("CPU (特級): [自己判断] 勝利確定！");
            return strongHand.length >= 2 ? [strongHand[0], strongHand[1]] : [strongHand[0]];
        }
        if (cpuPotentialScore > 21) {
            console.log("CPU (特級): [自己判断] バースト回避！");
            return [weakHand[0]];
        }
    
        // --- 思考の優先順位 2: 戦略的なリソース管理 ---
        const preservedRanks = ['A', '2', 'Q', 'K'];
        const normalHand = weakHand.filter(c => !preservedRanks.includes(c.rank)); // 通常カードを弱い順に
        const isCriticalPhase = (pScore > 15 || cScore > 15 || deck.length < 4);
    
        if (!isCriticalPhase && normalHand.length > 0) {
            // 【序盤】手札を整えるため、戦略的にカードを放出する
            if (Math.random() < 0.3) {
                console.log("CPU (特級): [戦略] 最弱の通常カードを放出。");
                return [normalHand[0]];
            } else {
                console.log("CPU (特級): [戦略] 中間の通常カードを処理。");
                const middleIndex = Math.floor((normalHand.length - 1) / 2);
                return [normalHand[middleIndex]];
            }
        } else {
            // 【終盤】または通常カードがない場合は、堅実な手を選ぶ
            console.log("CPU (特級): 終盤戦。堅実にいく。");
            if (targetCard.value >= 8 && normalHand.length > 0) {
                // 価値の高いカードには、通常カードの最強で応戦
                return [normalHand[normalHand.length - 1]];
            } else {
                // それ以外は、手札全体の最弱カードで最小コストに抑える
                return [weakHand[0]];
            }
        }
    }

    function initializeAudioOnFirstInteraction() {
        initAudio();
        document.body.removeEventListener('click', initializeAudioOnFirstInteraction);
        document.body.removeEventListener('touchend', initializeAudioOnFirstInteraction);
    }

    // ===============================================
    // 4. UIインタラクション
    // ===============================================

    // --- プレイヤーのアクション関数 ---

    function onCardClick(cardId) {
        if (isAnimating) return;
        playSound('click', 0.05, 0.3);
        const index = selectedCards.indexOf(cardId);
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
    // ★★★ 対人戦用の、新しい手札クリック処理 ★★★
    playerHandElement.addEventListener('click', (event) => {
        if (gameMode !== 'multi' || playerHandElement.classList.contains('locked')) return;
        const cardEl = event.target.closest('.card');
        if (!cardEl || !cardEl.dataset.card) return;
        
        const properCardId = cardEl.dataset.card; // これが正しい
    
        playSound('click', 0.05, 0.3);
        const index = selectedCards.indexOf(properCardId);
        if (index > -1) {
            selectedCards.splice(index, 1);
            cardEl.classList.remove('selected');
        } else {
            if (selectedCards.length < 2) {
                selectedCards.push(properCardId);
                cardEl.classList.add('selected');
            }
        }
        updateConfirmButton();
    });

    function updateConfirmButton() {
        if (!confirmButton) return;
        let isMyTurnInMulti = false;
        if (gameMode === 'multi' && window.gameState && window.gameState.players) {
            const myPlayerId = sessionStorage.getItem('burstAuctionPlayerId');
            isMyTurnInMulti = window.gameState.turn === myPlayerId && window.gameState.phase === 'bidding';
        }
        const canClick = (gameMode === 'solo' || isMyTurnInMulti);
        confirmButton.disabled = selectedCards.length === 0 || isAnimating || !canClick;
    }

    async function onConfirmClick() {
        if (gameMode === 'solo') {
            await onConfirmClick_solo();
        } else {
            await onConfirmClick_multi();
        }
    }
    async function onConfirmClick_solo() {
        if (selectedCards.length === 0 || isAnimating) return;
        if (turnCount === 1) { difficultyRadios.forEach(radio => radio.disabled = true); }
        const bidPromises = [];
        const cardElementsToMove = Array.from(playerHandElement.querySelectorAll('.selected'));
        cardElementsToMove.forEach(cardEl => {
            const cardId = cardEl.dataset.card;
            const cardData = playerHand.find(c => `${c.suit}${c.rank}` === cardId);
            if (cardData) { bidPromises.push(animateCardMove(cardEl, playerBidCardsElement, cardData)); }
        });
        await Promise.all(bidPromises);
        playerBid = playerHand.filter(card => selectedCards.includes(`${card.suit}${card.rank}`));
        playerHand = playerHand.filter(card => !selectedCards.includes(`${card.suit}${card.rank}`));
        renderCardList(playerBidCardsElement, playerBid);
        selectedCards = [];
        render();
        updateConfirmButton();
        progressTurn();
    }
    async function onConfirmClick_multi() {
        if (selectedCards.length === 0) { return; }
    
        const myPlayerId = localPlayerId;
        const opponentId = myPlayerId === 'player1' ? 'player2' : 'player1';
        
        // 最新のゲーム状態を取得
        const snapshot = await gameRef.once('value');
        const gameState = snapshot.val();
        
        const myHand = gameState.hands[myPlayerId] || [];
        const bidData = myHand.filter(card => selectedCards.includes(card.suit + card.rank));
    
        // 相手の手札が空かどうかをチェック
        const opponentHand = gameState.hands[opponentId] || [];
        const isOpponentHandEmpty = opponentHand.length === 0 || opponentHand[0].rank === 'none';
    
        if (isOpponentHandEmpty) {
            // ★★★ 相手の手札が0枚の場合の特別処理 ★★★
            console.log("相手の手札が0枚なので、即座に勝利判定に進みます。");
    
            // 自分の入札だけをDBにセットし、すぐに勝敗判定を呼び出す
            const updates = {};
            updates[`/bids/${myPlayerId}`] = bidData;
            // 相手の入札は空（プレースホルダー）のまま
            updates[`/bids/${opponentId}`] = [{ rank: "none", suit: "N", value: 0 }];
            updates['/message'] = "勝敗を判定します...";
            
            await gameRef.update(updates);
            // この後、gameStateListenerが変更を検知して、resolveMultiplayerBidを呼び出すはず
            
        } else {
            // ★★★ 通常の処理 (相手の手札がある場合) ★★★
            const updates = {};
            updates[`/bids/${myPlayerId}`] = bidData;
            updates['/turn'] = opponentId;
            updates['/message'] = `${gameState.players[opponentId].name}が考えています...`;
            
            await gameRef.update(updates);
        }
        
        // 自分の選択状態はリセット
        selectedCards = [];
    }
    

    // --- 画面遷移ロジック ---

    function showScreen(screenId) {
        modeSelectionScreen.classList.remove('active');
        roomScreen.classList.remove('active');
        gameContainer.style.display = 'none';
        document.body.classList.remove('solo-mode', 'multi-mode');
    
        if (screenId === 'mode-selection') {
            modeSelectionScreen.classList.add('active');
        } else if (screenId === 'room') {
            roomScreen.classList.add('active');
            roomMessageElement.textContent = '';
        } else if (screenId === 'game') {
            gameContainer.style.display = 'flex';
            if (gameMode === 'solo') {
                document.body.classList.add('solo-mode');
                document.getElementById('difficulty-selector').style.display = 'block';
            } else {
                document.body.classList.add('multi-mode');
            }
        }
    }

    // ===============================================
    // 5. イベントリスナーの登録
    // ===============================================

    confirmButton.addEventListener('click', onConfirmClick);

    restartButton.addEventListener('click', () => {
        confirmButton.style.display = 'block';
        restartButton.style.display = 'none';
        if(gameMode === 'solo') {
            initializeGame();
        } else {
            leaveRoom(); // 対人戦の場合は部屋から退出してモード選択へ
        }
    });

    document.body.addEventListener('click', initializeAudioOnFirstInteraction);
    document.body.addEventListener('touchend', initializeAudioOnFirstInteraction);

    difficultyRadios.forEach(radio => {
        radio.addEventListener('change', (event) => {
            cpuDifficulty = event.target.value;
            console.log(`CPUの難易度を「${cpuDifficulty}」に変更しました。`);
        });
    });

    soloPlayButton.addEventListener('click', () => {
        console.log("モード: ひとりプレイ");
        gameMode = 'solo';
        showScreen('game');
        initializeGame();
    });

    multiPlayButton.addEventListener('click', () => {
        console.log("モード: ふたりプレイ");
        gameMode = 'multi';
        showScreen('room');
    });

    createRoomButton.addEventListener('click', createRoom);

    joinRoomButton.addEventListener('click', async () => {
        const roomId = roomIdInput.value.trim();
        if (!roomId) {
            alert("部屋の番号を入力してください。");
            return;
        }
        
        const guestGameRef = database.ref('rooms/' + roomId);
        try {
            const snapshot = await guestGameRef.once('value');
            if (snapshot.exists()) {
                const gameState = snapshot.val();
    
                // 部屋が満員でないかチェック
                if (gameState.players.player2.isConnected) {
                    alert("この部屋はすでに満員です。");
                    return;
                }
    
                const initialDeck = gameState.deck;
                const firstBidTarget = initialDeck.pop(); // 配列の最後の要素を取り出す
    
                const updates = {
                    'phase': 'bidding',
                    'bidTarget': firstBidTarget,
                    'deck': initialDeck,
                    'message': `${gameState.players.player1.name}の番です。入札するカードを選んでください。`,
                    'turn': 'player1'
                };
    
                await guestGameRef.update(updates);
    
                console.log(`部屋[${roomId}]に参加します。`);
                enterRoom(roomId, 'player2');
    
            } else {
                alert("その部屋番号は存在しません。");
            }
        } catch(error) {
            console.error("部屋への参加中にエラー:", error);
            alert("部屋への参加に失敗しました。");
        }
    });

    backToModeSelectionButton.addEventListener('click', () => {
        showScreen('mode-selection');
    });

    // --- ゲーム開始のトリガー ---
    showScreen('mode-selection');

}); // ← 全てを囲む、最後の閉じカッコ