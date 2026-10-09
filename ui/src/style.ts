export const STYLE = `
:root{--bg:#f4f5fb;--card:#fff;--box:#f2f3f8;--line:#e3e5ef;--text:#14151a;--muted:#6b6f80;--accent:#ff3d8b;--accent-text:#fff;--ok:#16a34a;
  color-scheme:light dark;font:16px/1.4 Inter,system-ui,-apple-system,"Segoe UI",sans-serif}
@media(prefers-color-scheme:dark){:root{--bg:#0d0e12;--card:#16181f;--box:#1f222b;--line:#2a2e3a;--text:#f2f3f7;--muted:#9097a8}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:radial-gradient(60rem 30rem at 50% -10rem,color-mix(in srgb,var(--accent) 18%,transparent),transparent),var(--bg);color:var(--text)}
main{max-width:30rem;margin:0 auto;padding:24px 16px 48px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:20px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:8px;font-weight:700;font-size:1.25rem}
.logo{display:grid;place-items:center;width:32px;height:32px;border-radius:10px;background:var(--accent);color:var(--accent-text)}
.pills{display:flex;gap:4px;padding:4px;border-radius:999px;background:var(--card);border:1px solid var(--line)}
.pills button{border:0;background:none;color:var(--muted);padding:6px 14px;border-radius:999px;font:inherit;font-weight:600;cursor:pointer}
.pills button.on{background:var(--box);color:var(--text)}
.card{background:var(--card);border:1px solid var(--line);border-radius:24px;padding:12px;box-shadow:0 12px 40px rgb(0 0 0 / .08)}
.box{background:var(--box);border-radius:18px;padding:14px 16px}
.line{display:flex;align-items:center;justify-content:space-between;gap:8px;color:var(--muted);font-size:.9rem}
.line+.line{margin-top:6px}
input,output{flex:1;min-width:0;font:inherit;font-size:2rem;font-weight:500;color:var(--text);background:none;border:0;padding:0;outline:none}
output{overflow:hidden;text-overflow:ellipsis}
select{font:inherit;font-weight:600;color:var(--text);background:var(--card);border:1px solid var(--line);border-radius:999px;padding:6px 12px;cursor:pointer}
.flip{display:grid;place-items:center;width:40px;height:40px;margin:-14px auto;position:relative;z-index:1;border-radius:12px;border:4px solid var(--card);background:var(--box);color:var(--text);font-size:1.1rem;cursor:pointer}
.flip:hover{color:var(--accent)}
.details{margin:12px 4px 0;font-size:.9rem}
.details div{display:flex;justify-content:space-between;padding:3px 0}
.details dt{color:var(--muted)}.details dd{margin:0}
.primary{width:100%;margin-top:12px;padding:16px;border:0;border-radius:18px;background:var(--accent);color:var(--accent-text);font:inherit;font-size:1.1rem;font-weight:700;cursor:pointer}
.primary:disabled{background:var(--box);color:var(--muted);cursor:default}
.link{border:0;background:none;color:var(--accent);font:inherit;font-size:.9rem;cursor:pointer;padding:0}
.muted{color:var(--muted)}
#msg{margin:12px 4px 0;white-space:pre-wrap;word-break:break-word;font-size:.9rem}
#msg:empty{display:none}
#msg a{color:var(--accent)}
footer{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;margin-top:20px;font-size:.85rem;color:var(--muted)}
footer p{width:100%;margin:0}
.love{text-align:center;margin-top:8px!important}.love span{color:var(--accent)}.love a{color:inherit;font-weight:600}
dialog{max-width:28rem;width:calc(100% - 32px);border:1px solid var(--line);border-radius:24px;padding:20px;background:var(--card);color:var(--text)}
dialog::backdrop{background:rgb(0 0 0 / .55)}
dialog h2{margin:0 0 12px;font-size:1.2rem}dialog h3{margin:16px 0 6px;font-size:1rem}
dialog ul{margin:0;padding-left:18px;font-size:.9rem}dialog li+li{margin-top:4px}dialog p{font-size:.9rem;margin:0}
.flow{list-style:none;margin:0;padding:0;display:grid;gap:22px}
.flow li{position:relative;background:var(--box);border-radius:14px;padding:10px 12px;font-size:.9rem;display:grid;gap:2px}
.flow li+li::before{content:"↓";position:absolute;top:-21px;left:50%;transform:translateX(-50%);color:var(--accent)}
.flow b{font-size:.95rem}.flow span{color:var(--muted)}
button:focus-visible,select:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.box:focus-within{box-shadow:inset 0 0 0 1px var(--accent)}
`;
