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
    const auth = firebase.auth(); // ★ Authサービスへの参照を追加

    // ★★★ 匿名認証処理を追加 ★★★
    auth.onAuthStateChanged(user => {
        if (user) {
            // ユーザーは匿名ログイン済み
            console.log("匿名ユーザーとしてログインしました。UID:", user.uid);
            // ここで初めてメインの処理を開始する
            initializeApp(user); 
        } else {
            // ユーザーはログアウトしている
            console.log("ユーザーはログアウトしています。");
            auth.signInAnonymously().catch(error => {
                console.error("匿名ログインに失敗しました:", error);
                alert("サーバーへの接続に失敗しました。ページをリロードしてください。");
            });
        }
    });
    function initializeApp(user) {
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
        const restartButton = document.getElementById('restart-button');　// ←リスタートボタン
        const rematchButton = document.getElementById('rematch-button'); // ★追加
        const leaveRoomButton = document.getElementById('leave-room-button'); // ★追加
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
         * カード配列から、ゲームロジック上有効なカードのみをフィルタリングして返します。
         * (Firebaseのプレースホルダーデータなどを除外)
         * @param {Array<object>|undefined|null} cards - カードオブジェクトの配列
         * @returns {Array<object>} - 有効なカードのみの配列
         */
        function getValidCards(cards) {
            // Optional Chaining (?.) と Nullish Coalescing (??) を使い、
            // cardsがnullやundefinedの場合でも安全に空配列を返します。
            return cards?.filter(card => card && card.rank !== "none") ?? [];
        }

        /**
         * カードの配列を受け取り、その合計得点を計算します。
         * @param {Array<object>} cards - カードオブジェクトの配列
         * @returns {number} - 合計得点
         */
        function calculateScore(cards) {
            // getValidCards を通すことで、プレースホルダーを意識せずに得点計算できます。
            return getValidCards(cards).reduce((sum, card) => sum + card.value, 0);
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
                    // ★★★ uidを追加 ★★★
                    player1: { name: 'プレイヤー1', score: 0, isConnected: true, uid: auth.currentUser.uid },
                    player2: { name: 'プレイヤー2', score: 0, isConnected: false, uid: null } // p2は最初は空
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

            // ★★★ onDisconnect の設定を強化 ★★★
            // 自分が切断されたら、'isConnected'をfalseにし、'leftGame'フラグを立てる
            await playerRef.update({ isConnected: true, leftGame: false });
            playerRef.onDisconnect().update({ isConnected: false, leftGame: true });

            showScreen('game');
            startRealtimeListener();
        }

        function startRealtimeListener() {
            if (gameStateListener) { gameRef.off('value', gameStateListener); }
            gameStateListener = gameRef.on('value', (snapshot) => {
        
                // 【A】部屋が削除された時の処理
                if (!snapshot.exists()) {
                    alert("部屋が解散されました。");
                    if (gameStateListener) gameRef.off('value', gameStateListener);
                    // ローカルの状態をきれいにリセット
                    currentRoomId = null;
                    localPlayerId = null;
                    gameRef = null;
                    gameStateListener = null;
                    selectedCards = [];
                    showScreen('mode-selection');
                    return; // これ以上何もしない
                }
        
                // 【B】部屋が存在する場合の通常の処理
                const oldGameState = window.gameState;
                const gameState = snapshot.val();
                
                if (gameState && gameState.players) {
                    window.gameState = gameState;
                    renderMultiplayerGame(gameState);
        
                    // --- ここから各種の自動処理 ---
        
                    // 【B-1】相手の入室を検知
                    if (oldGameState && oldGameState.players.player2 && 
                        !oldGameState.players.player2.isConnected && 
                        gameState.players.player2.isConnected) {
                        playSound('win', 0.15, 0.4);
                    }
        
                    // 【B-2】相手の退出/切断を検知（不戦勝処理）
                    if (gameState.phase !== 'finished') {
                        const opponentId = localPlayerId === 'player1' ? 'player2' : 'player1';
                        
                        // 相手が退出していて、かつ、自分がまだ退出していない場合
                        if (gameState.players[opponentId] && gameState.players[opponentId].leftGame && 
                            gameState.players[localPlayerId] && !gameState.players[localPlayerId].leftGame) {
                            
                            // ★★★★★ 「自分が」更新処理を行う ★★★★★
                            console.log("相手が退出したのを検知。不戦勝処理を実行します。");
                            const finalMessage = `${gameState.players[opponentId].name}が退出しました。あなたの勝利です！`;
                            gameRef.update({ phase: 'finished', message: finalMessage });
                            playVictoryJingle();
                        }
                    }
        
                    // 【B-3】ゲーム進行のフェーズ管理（部屋主'player1'が担当）
                    if (localPlayerId === 'player1') {
                        // 'bidding'フェーズ: 入札が揃ったら'reveal'へ
                        if (gameState.phase === 'bidding') {
                            const p1Bid = gameState.bids.player1.filter(c => c.rank !== "none");
                            const p2Bid = gameState.bids.player2.filter(c => c.rank !== "none");
                            const p1Hand = gameState.hands.player1 || [];
                            const p2Hand = gameState.hands.player2 || [];
                            const isP1HandEmpty = p1Hand.length === 0 || p1Hand[0].rank === 'none';
                            const isP2HandEmpty = p2Hand.length === 0 || p2Hand[0].rank === 'none';
                            const shouldReveal = (p1Bid.length > 0 && p2Bid.length > 0) || (p1Bid.length > 0 && isP2HandEmpty) || (p2Bid.length > 0 && isP1HandEmpty);
                            if (shouldReveal) {
                                gameRef.update({ phase: 'reveal', message: 'いざ、勝負！' });
                            }
                        }
                        // 'reveal'フェーズ: 1.5秒待って'judging'へ
                        else if (gameState.phase === 'reveal') {
                            setTimeout(() => { gameRef.update({ phase: 'judging' }); }, 1500);
                        }
                        // 'judging'フェーズ: 勝敗判定を実行
                        else if (gameState.phase === 'judging') {
                            resolveMultiplayerBid(gameState);
                        }
                        // 'finished'フェーズ: 再戦と部屋削除の管理
                        else if (gameState.phase === 'finished') {
                            const p1 = gameState.players.player1;
                            const p2 = gameState.players.player2;
                            // 両者が再戦を望んだら、ゲームをリセット
                            if (p1.wantsRematch && p2.wantsRematch) {
                                resetGameForRematch();
                            }
                            // 両者が退出したら、部屋を削除
                            else if (p1.leftGame && p2.leftGame) {
                                gameRef.remove();
                            }
                        }
                    }
                }
            });
        }
        
        // ★★★ ゲームリセット用の新しい関数を作成 ★★★
        function resetGameForRematch() {
            // createRoomのロジックを再利用
            const initialDeck = createInitialDeck();
            const { player1Hand, player2Hand, deck: remainingDeck } = dealInitialHands(initialDeck);
            const placeholder = { rank: "none", suit: "N", value: 0 };
            
            // 新しいゲーム状態を作成
            const newGameState = {
                // roomId, players の名前と isConnected は維持
                roomId: currentRoomId,
                players: {
                    player1: { name: 'プレイヤー1', score: 0, isConnected: true, wantsRematch: false },
                    player2: { name: 'プレイヤー2', score: 0, isConnected: true, wantsRematch: false }
                },
                // ゲームの初期状態に戻す
                turn: 'player1',
                phase: 'bidding',
                message: '再戦開始！プレイヤー1の番です。',
                deck: remainingDeck,
                hands: { player1: player1Hand, player2: player2Hand },
                bids: { player1: [placeholder], player2: [placeholder] },
                usedCards: { player1: [placeholder], player2: [placeholder] },
                acquiredCards: { player1: [placeholder], player2: [placeholder] },
                bidTarget: null
            };

            // 新しいbidTargetをセット
            const firstBidTarget = newGameState.deck.pop();
            newGameState.bidTarget = firstBidTarget;

            // Firebaseのルームデータ全体を、新しいゲーム状態に丸ごと上書きする
            gameRef.set(newGameState);
        }

        async function leaveRoom() {
            if (gameRef && localPlayerId) {
                // 【フェーズ1】Firebaseの状態を確認し、適切な処理を決定する
                try {
                    // まずDBから最新のゲーム状態を一度だけ取得する
                    const snapshot = await gameRef.once('value');
                    
                    if (snapshot.exists()) {
                        const gameState = snapshot.val();
                        const opponentId = localPlayerId === 'player1' ? 'player2' : 'player1';
                        
                        // 予約していたonDisconnect処理は、どんな場合でもキャンセルする
                        await gameRef.child('players/' + localPlayerId).onDisconnect().cancel();
        
                        // 相手がすでに退出済み(leftGame: true)かチェック
                        if (gameState.players[opponentId] && gameState.players[opponentId].leftGame) {
                            // 【パターンA】相手はもういない -> 自分が最後のひとり
                            console.log("相手は退出済み。部屋を削除して終了します。");
                            await gameRef.remove(); // 部屋ごと削除
                        } else {
                            // 【パターンB】相手はまだいる -> 自分の退出情報だけを更新
                            console.log("相手がまだいるため、自分の退出情報を記録します。");
                            const playerRef = gameRef.child('players/' + localPlayerId);
                            await playerRef.update({ isConnected: false, leftGame: true });
                        }
                    }
                } catch (error) {
                    console.error("退出処理中にエラーが発生しました:", error);
                }
            }
            
            // 【フェーズ2】クライアント側の後始末（これは常に実行する）
            // リアルタイム監視を停止する
            if (gameRef && gameStateListener) {
                gameRef.off('value', gameStateListener);
            }
            // このセッションで使っていた変数をすべて初期化する
            currentRoomId = null;
            localPlayerId = null;
            gameRef = null;
            gameStateListener = null;
            selectedCards = [];
            
            // モード選択画面に戻る
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
        // 4-2. 対人戦モード専用の描画エンジン (最適化版)
        // ===============================================
        function renderMultiplayerGame(gameState) {
            // --- 1. 早期リターンと必須変数の準備 ---
            const myPlayerId = localPlayerId;
            if (!myPlayerId || !gameState?.players || !gameState?.hands) {
                console.error("描画に必要なデータが不足しています。", { localPlayerId, gameState });
                return;
            }

            const opponentId = myPlayerId === 'player1' ? 'player2' : 'player1';
            const me = gameState.players?.[myPlayerId];
            const opponent = gameState.players?.[opponentId];

            if (!me || !opponent) {
                console.error("プレイヤーデータが見つかりません。");
                return;
            }
            
            // --- 2. 画面の各部分を描画するヘルパー関数を呼び出す ---
            updateOpponentArea(opponent, gameState.hands?.[opponentId], gameState.usedCards?.[opponentId], gameState.acquiredCards?.[opponentId], gameState.bids?.[opponentId], gameState.phase, gameState.turn === myPlayerId);
            updatePlayerArea(me, gameState.hands?.[myPlayerId], gameState.usedCards?.[myPlayerId], gameState.acquiredCards?.[myPlayerId], gameState.bids?.[myPlayerId]);
            updateFieldArea(gameState.deck, gameState.bidTarget, gameState.message, gameState.roomId);
            updateGameControls(gameState);

            // --- 3. 自分の手札の操作可否を制御 ---
            const isMyTurn = gameState.turn === myPlayerId && gameState.phase === 'bidding';
            playerHandElement.classList.toggle('locked', !isMyTurn);
            updateConfirmButton();
        }

        /** 相手プレイヤーのエリア全体を更新します */
        function updateOpponentArea(opponent, hand, used, acquired, bid, phase, isMyTurn) {
            document.querySelector('#cpu-area h2').textContent = opponent.name + (opponent.isConnected ? '' : ' (接続待機中)');
            cpuScoreElement.textContent = calculateScore(acquired);
            cpuHandCountElement.textContent = getValidCards(hand).length;
            renderCardList(cpuUsedCardsElement, used);
            renderCardList(cpuAcquiredCardsElement, acquired);

            // 自分のターンの入札フェーズ中は、相手の入札を裏面で表示
            if (phase === 'bidding' && isMyTurn) {
                renderCardBacks(cpuBidCardsElement, getValidCards(bid).length);
            } else {
                renderCardList(cpuBidCardsElement, bid);
            }
        }

        /** 自分プレイヤーのエリア全体を更新します */
        function updatePlayerArea(player, hand, used, acquired, bid) {
            playerScoreElement.textContent = calculateScore(acquired);

            // 手札の描画 (selectedクラスの制御も含む)
            playerHandElement.innerHTML = '';
            getValidCards(hand)
            .sort((a, b) => a.value - b.value)
            .forEach(card => {
                const cardEl = createCardElement(card);
                if (selectedCards.includes(card.suit + card.rank)) {
                    cardEl.classList.add('selected');
                }
                playerHandElement.appendChild(cardEl);
            });

            renderCardList(playerUsedCardsElement, used);
            renderCardList(playerAcquiredCardsElement, acquired);
            renderCardList(playerBidCardsElement, bid);
        }

        /** 中央のフィールドエリア（山札、競り対象、メッセージ）を更新します */
        function updateFieldArea(deck, bidTarget, message, roomId) {
            // Firebaseは配列をオブジェクトとして返すことがあるため、安全に長さを取得
            deckCountElement.textContent = deck ? (Array.isArray(deck) ? deck.length : Object.keys(deck).length) : 0;
            
            bidTargetCardElement.innerHTML = '';
            if (bidTarget) {
                bidTargetCardElement.appendChild(createCardElement(bidTarget));
            }
            
            messageElement.textContent = message ?? '...'; // messageがnullなら'...'を表示
            
            if (multiplayerRoomInfoElement) {
                multiplayerRoomInfoElement.textContent = `部屋番号: ${roomId}`;
                document.body.classList.add('multi-mode'); // 部屋情報表示用のクラスを付与
            }
        }

        /** ゲームの状態に応じてボタンの表示/非表示やテキストを制御します */
        function updateGameControls(gameState) {
            const isGameFinished = gameState.phase === 'finished';

            // ボタンの表示/非表示を三項演算子でスッキリ記述
            rematchButton.style.display = isGameFinished ? 'block' : 'none';
            leaveRoomButton.style.display = isGameFinished ? 'block' : 'none';
            confirmButton.style.display = isGameFinished ? 'none' : 'block';

            // ソロプレイ用UIは常に非表示
            document.getElementById('restart-button').style.display = 'none';
            document.getElementById('difficulty-selector').style.display = 'none';

            if (isGameFinished) {
                const me = gameState.players?.[localPlayerId];
                const opponent = gameState.players?.[localPlayerId === 'player1' ? 'player2' : 'player1'];
                
                if (me && opponent) {
                    if (!me.wantsRematch) {
                        rematchButton.disabled = false;
                        rematchButton.textContent = opponent.wantsRematch ? "相手が再戦を望んでいます！" : '再戦する';
                    } else {
                        rematchButton.disabled = true;
                        rematchButton.textContent = "再戦待機中...";
                    }
                }
            }
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

        /**
         * 現在のゲーム状態から、ゲームが終了しているかどうかを判定します。
         * @param {object} p1State - プレイヤー1の状態 { score, handSize, name }
         * @param {object} p2State - プレイヤー2の状態 { score, handSize, name }
         * @param {boolean} isDeckEmpty - 山札が空かどうか
         * @returns {{isGameOver: boolean, message: string, p1Result: string, p2Result: string}|null} 判定結果
         */
        function checkGameEndCondition(p1State, p2State, isDeckEmpty) {
            let isGameOver = false;
            let message = '';
            let p1Result = 'draw', p2Result = 'draw';

            // 判定ロジックを配列とfindで管理し、最初に見つかった条件を採用する
            const conditions = [
                { check: () => p1State.score > 21,      msg: `${p1State.name}がバースト！ ${p2State.name}の勝利！`,      res: ['lose', 'win'] },
                { check: () => p2State.score > 21,      msg: `${p2State.name}がバースト！ ${p1State.name}の勝利！`,      res: ['win', 'lose'] },
                { check: () => p1State.score === 21,    msg: `${p1State.name}が21点ぴったり！勝利です！`,                 res: ['win', 'lose'] },
                { check: () => p2State.score === 21,    msg: `${p2State.name}が21点ぴったり！勝利です！`,                 res: ['lose', 'win'] },
                { check: () => isDeckEmpty,             msg: '山札切れ！スコアで勝負！',                                 res: null }, // スコア勝負へ
                { check: () => p1State.handSize === 0 && p2State.handSize === 0, msg: '両者手札切れ！スコアで勝負！', res: null }  // スコア勝負へ
            ];

            const finalCondition = conditions.find(c => c.check());

            if (finalCondition) {
                isGameOver = true;
                message = finalCondition.msg;
                if (finalCondition.res) { // 勝敗が即時決定する場合
                    [p1Result, p2Result] = finalCondition.res;
                } else { // スコア勝負の場合
                    if (p1State.score > p2State.score) {
                        message += ` ${p1State.name}の勝利！ (${p1State.score} vs ${p2State.score})`;
                        [p1Result, p2Result] = ['win', 'lose'];
                    } else if (p2State.score > p1State.score) {
                        message += ` ${p2State.name}の勝利！ (${p1State.score} vs ${p2State.score})`;
                        [p1Result, p2Result] = ['lose', 'win'];
                    } else {
                        message += ` 引き分け！ (${p1State.score} vs ${p2State.score})`;
                    }
                }
            }

            return isGameOver ? { isGameOver, message, p1Result, p2Result } : null;
        }

        function checkGameOver() {
            if (gameMode === 'multi') return;
        
            // --- 1. 新しい判定関数に必要な情報を準備 ---
            const playerState = {
                name: 'あなた',
                score: calculateScore(playerAcquired),
                handSize: playerHand.length
            };
            const cpuState = {
                name: 'CPU',
                score: calculateScore(cpuAcquired),
                handSize: cpuHand.length
            };
            const isDeckEmpty = deck.length === 0;
        
            // --- 2. 新しい判定関数を呼び出す ---
            const result = checkGameEndCondition(playerState, cpuState, isDeckEmpty);
        
            // --- 3. 判定結果に応じて処理を分岐 ---
            if (result && result.isGameOver) {
                // ゲームが終了した場合
                if (result.p1Result === 'win') {
                    playVictoryJingle();
                } else if (result.p1Result === 'lose') {
                    playDefeatJingle();
                }
                messageElement.textContent = result.message;
                confirmButton.style.display = 'none';
                restartButton.style.display = 'block';
            } else {
                // ゲームが続く場合
                startTurn();
            }
        }
        async function resolveMultiplayerBid(currentState) {
            // ガード処理 (変更なし)
            if (currentState.phase !== 'judging' || localPlayerId !== 'player1') {
                return;
            }
            await gameRef.child('phase').set('resolving');
        
            // --- 1. スコア計算と勝者判定 (変更なし) ---
            const p1Bid = getValidCards(currentState.bids.player1);
            const p2Bid = getValidCards(currentState.bids.player2);
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
            // ラウンド勝利音はリスナー側で鳴らす方が安定する可能性もあるが、一旦このまま
            if (winnerId !== 'draw') playSound('win', 0.2, 0.4);
        
            // --- 2. データベース更新内容の準備 (getValidCardsを使ってより安全に) ---
            const updates = {};
            const placeholder = { rank: "none", suit: "N", value: 0 };
            
            // 獲得カードの更新
            if (winnerId !== 'draw') {
                const winnerAcquired = [...getValidCards(currentState.acquiredCards[winnerId]), currentState.bidTarget];
                updates[`/acquiredCards/${winnerId}`] = winnerAcquired;
            }
            
            // 使用済みカードの更新
            updates['/usedCards/player1'] = [...getValidCards(currentState.usedCards.player1), ...p1Bid];
            updates['/usedCards/player2'] = [...getValidCards(currentState.usedCards.player2), ...p2Bid];
            
            // 手札の更新
            const p1Hand = getValidCards(currentState.hands.player1).filter(card => !p1Bid.some(bidCard => bidCard.suit === card.suit && bidCard.rank === card.rank));
            updates['/hands/player1'] = p1Hand.length > 0 ? p1Hand : [placeholder];
            const p2Hand = getValidCards(currentState.hands.player2).filter(card => !p2Bid.some(bidCard => bidCard.suit === card.suit && bidCard.rank === card.rank));
            updates['/hands/player2'] = p2Hand.length > 0 ? p2Hand : [placeholder];
        
            // 入札と山札の更新
            updates['/bids/player1'] = [placeholder];
            updates['/bids/player2'] = [placeholder];
            const nextDeck = getValidCards(currentState.deck); // pop()の前に必ず有効なカード配列に変換
            const nextBidTarget = nextDeck.length > 0 ? nextDeck.pop() : null;
            updates['/deck'] = nextDeck.length > 0 ? nextDeck : [placeholder];
            updates['/bidTarget'] = nextBidTarget;
            updates['/message'] = message + " ... 次のターンへ";
            
            // --- 3. データベースを一度に更新 (変更なし) ---
            await gameRef.update(updates);
        
            // --- 4. 少し待ってから、次のターンまたはゲーム終了処理を開始する (★★★ここからが書き換え対象★★★) ---
            setTimeout(async () => {
                // DBから「今」の状態を再取得
                const latestSnapshot = await gameRef.once('value');
                const latestState = latestSnapshot.val();
                if (!latestState) return; // 部屋が消えた場合など
        
                // 新しい判定関数に必要な情報を準備
                const p1State = {
                    name: latestState.players.player1.name,
                    score: calculateScore(latestState.acquiredCards.player1),
                    handSize: getValidCards(latestState.hands.player1).length
                };
                const p2State = {
                    name: latestState.players.player2.name,
                    score: calculateScore(latestState.acquiredCards.player2),
                    handSize: getValidCards(latestState.hands.player2).length
                };
                const isDeckEmpty = !latestState.bidTarget; // bidTargetがnullなら山札切れ
        
                // 新しい判定関数を呼び出す
                const gameEndResult = checkGameEndCondition(p1State, p2State, isDeckEmpty);
        
                if (gameEndResult && gameEndResult.isGameOver) {
                    // 【ゲーム終了】
                    // 各プレイヤーに結果に応じたジングルを鳴らす
                    if (localPlayerId === 'player1') {
                        if (gameEndResult.p1Result === 'win') playVictoryJingle();
                        else if (gameEndResult.p1Result === 'lose') playDefeatJingle();
                    } else { // player2の場合
                        if (gameEndResult.p2Result === 'win') playVictoryJingle();
                        else if (gameEndResult.p2Result === 'lose') playDefeatJingle();
                    }
                    // 最終メッセージをセットして、フェーズを 'finished' に更新
                    await gameRef.update({ 'phase': 'finished', 'message': gameEndResult.message });
        
                } else {
                    // 【ゲーム続行】
                    // 次のターンの情報を準備
                    const nextTurnUpdates = { 'phase': 'bidding' };
                    if (p1State.handSize > 0) {
                        nextTurnUpdates.turn = 'player1';
                        nextTurnUpdates.message = `${p1State.name}の番です。`;
                        // 相手の手札がないことをメッセージに追加
                        if (p2State.handSize === 0) {
                            nextTurnUpdates.message += ` (${p2State.name}は手札がありません)`;
                        }
                    } else if (p2State.handSize > 0) {
                        // p1の手札がない場合、p2のターン
                        nextTurnUpdates.turn = 'player2';
                        nextTurnUpdates.message = `${p2State.name}の番です。 (${p1State.name}は手札がありません)`;
                    }
                    // ターン情報を更新
                    await gameRef.update(nextTurnUpdates);
                }
            }, 2500); // 2.5秒待つ
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
            if (selectedCards.length === 0 || isAnimating) { return; }
            isAnimating = true; // ★二重クリック防止
            confirmButton.disabled = true;
        
            const myPlayerId = localPlayerId;
            const opponentId = myPlayerId === 'player1' ? 'player2' : 'player1';
        
            console.log(`%c[クリック] ${myPlayerId}が決定ボタンを押しました。`, 'color: blue; font-weight: bold;');
            console.log('[クリック] 現在のselectedCards:', selectedCards);

            try {
                // 1. 最新のゲーム状態を取得
                const snapshot = await gameRef.once('value');
                const gameState = snapshot.val();
                console.log('[クリック] DBから取得した最新のgameState:', gameState);
                
                // 2. 自分の「本当の」手札から、選択されたカードのデータを特定する
                const myTrueHand = gameState.hands[myPlayerId] || [];
                const bidData = myTrueHand.filter(card => selectedCards.includes(card.suit + card.rank));
        
                // 3. 選択したカードが本当に手札に存在するかチェック
                if (bidData.length !== selectedCards.length) {
                    console.error("手札にないカードが選択されています。リロードします。");
                    // alert("データに食い違いが発生しました。ページを更新します。");
                    // window.location.reload();
                    isAnimating = false; // エラーなのでロック解除
                    return;
                }
        
                // 4. 相手の手札が空かチェック（これは前のロジックと同じ）
                const opponentHand = gameState.hands[opponentId] || [];
                const isOpponentHandEmpty = opponentHand.length === 0 || opponentHand[0].rank === 'none';
        
                const updates = {};
                updates[`/bids/${myPlayerId}`] = bidData;
        
                if (isOpponentHandEmpty) {
                    updates[`/bids/${opponentId}`] = [{ rank: "none", suit: "N", value: 0 }];
                    updates['/message'] = "勝敗を判定します...";
                } else {
                    updates['/turn'] = opponentId;
                    updates['/message'] = `${gameState.players[opponentId].name}が考えています...`;
                }
                
                // 5. DBを更新
                console.log('[クリック] これからDBに送るupdates:', updates);
                await gameRef.update(updates);
                console.log('[クリック] DBの更新が完了しました。');
                
                // 6. ★★★ 自分のローカルの選択状態を即座にリセット ★★★
                // これで、次のターンが自分に戻ってきた時に、古いカードを選択できないようにする
                selectedCards = []; 
                // renderMultiplayerGame() は listener経由で呼ばれるので、ここでは呼ばない
        
            } catch (error) {
                console.error("入札情報の送信に失敗しました:", error);
            } finally {
                isAnimating = false; // 処理が終わったらロック解除
                // updateConfirmButton() も listener経由で呼ばれるので不要
            }
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
            initAudio();
            console.log("モード: ひとりプレイ");
            gameMode = 'solo';
            showScreen('game');
            initializeGame();
        });

        multiPlayButton.addEventListener('click', () => {
            initAudio();
            console.log("モード: ふたりプレイ");
            gameMode = 'multi';
            showScreen('room');
        });

        createRoomButton.addEventListener('click', () => {
            initAudio(); 
            createRoom();
        });

        joinRoomButton.addEventListener('click', async () => {
            initAudio();
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
                        // ★★★ isConnectedと同時にuidも設定する ★★★
                        '/players/player2/isConnected': true,
                        '/players/player2/uid': auth.currentUser.uid,
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

        // 「やめる」ボタンの処理 (シンプル)
        leaveRoomButton.addEventListener('click', () => {
            leaveRoom(); // 既存の退出関数を呼ぶだけ
        });

        // 「再戦する」ボタンの処理 (メインロジック)
        rematchButton.addEventListener('click', async () => {
            if (!gameRef || !localPlayerId) return;

            // 1. まず、自分が再戦を望んでいることをDBに記録する
            rematchButton.disabled = true; // 連打防止
            rematchButton.textContent = '再戦待機中...';
            const playerRef = gameRef.child('players/' + localPlayerId);
            await playerRef.update({ wantsRematch: true });
        });


        // --- ゲーム開始のトリガー ---
        showScreen('mode-selection');
    }
}); // ← 全てを囲む、最後の閉じカッコ