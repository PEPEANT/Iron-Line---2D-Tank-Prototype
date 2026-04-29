# Iron Line - 2D Tank Prototype

정적 HTML/JavaScript 기반 2D 전차/보병 프로토타입입니다.

## 실행

가장 안전한 실행 방법은 프로젝트 폴더에서 아래 명령을 쓰는 것입니다.

```powershell
npm start
```

게임:

```text
http://127.0.0.1:4173/index.html
```

드론 테스트랩:

```text
http://127.0.0.1:4173/index.html?testLab=drone
```

맵 편집기:

```text
http://127.0.0.1:4173/editor.html
```

## VS Code에서 실행

VS Code에서 `Terminal > Run Task... > Iron Line: local server 4173`을 실행하면 이 프로젝트 서버가 켜집니다.

Live Server 확장을 사용할 경우 이 폴더를 VS Code의 작업 폴더로 열어야 합니다. 다른 게임 폴더나 상위 폴더를 열어 둔 상태에서 `Go Live`를 누르면 `http://127.0.0.1:5500/index.html`처럼 다른 프로젝트의 `index.html`이 열릴 수 있습니다.

## 검사

```powershell
npm run check
```

`src/` 아래 JavaScript 파일을 문법 검사합니다.
