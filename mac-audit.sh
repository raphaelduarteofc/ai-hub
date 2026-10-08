#!/bin/bash
# mac-audit.sh — diagnóstico SOMENTE LEITURA do macOS. Não apaga nem altera nada.
# Uso: bash mac-audit.sh   (gera ~/Desktop/mac-audit-relatorio.txt)

OUT="$HOME/Desktop/mac-audit-relatorio.txt"
exec > >(tee "$OUT") 2>&1

sec() { printf '\n\n===== %s =====\n' "$1"; }
sz()  { du -sh "$@" 2>/dev/null | sort -rh; }

sec "SISTEMA"
sw_vers
sysctl -n machdep.cpu.brand_string
echo "RAM (GB): $(( $(sysctl -n hw.memsize) / 1073741824 ))"
uptime
echo "(Uptime de semanas = reiniciar ajuda bastante)"

sec "DISCO (abaixo de 15% livre o Mac fica lento)"
df -h /
diskutil info / | grep -E "Volume Free Space|Container Free Space|Solid State"
echo; echo "Snapshots locais do Time Machine:"
tmutil listlocalsnapshots / 2>/dev/null

sec "MEMÓRIA / SWAP"
memory_pressure 2>/dev/null | tail -n 5
sysctl vm.swapusage

sec "TOP 15 PROCESSOS POR CPU"
ps -Ao pcpu,pmem,comm -r | head -n 16

sec "TOP 15 PROCESSOS POR MEMÓRIA"
ps -Ao pmem,rss,comm -m | head -n 16 | awk '{printf "%s%%  %dMB  %s\n",$1,$2/1024,$3}'

sec "SAÚDE DO DISCO (SMART) E BATERIA"
diskutil info disk0 2>/dev/null | grep -i "SMART"
system_profiler SPPowerDataType 2>/dev/null | grep -E "Cycle Count|Condition|Maximum Capacity"

sec "ITENS DE LOGIN (abrem sozinhos ao ligar)"
osascript -e 'tell application "System Events" to get the name of every login item' 2>/dev/null
echo; echo "Apps em segundo plano (macOS 13+): veja Ajustes > Geral > Itens de Login"

sec "LAUNCH AGENTS / DAEMONS DE TERCEIROS"
for d in "$HOME/Library/LaunchAgents" /Library/LaunchAgents /Library/LaunchDaemons; do
  echo "--- $d"; ls -1 "$d" 2>/dev/null
done
echo; echo "--- Carregados agora (fora da Apple):"
launchctl list 2>/dev/null | grep -v "com.apple" | head -n 60

sec "EXTENSÕES / PERFIS (antivírus, VPN, MDM costumam pesar)"
systemextensionsctl list 2>/dev/null | head -n 30
profiles list 2>/dev/null | head -n 10

sec "PASTAS GRANDES NA HOME (top)"
sz "$HOME"/* "$HOME"/.[!.]* 2>/dev/null | head -n 25

sec "~/Library (onde mais acumula lixo)"
sz "$HOME/Library"/* 2>/dev/null | head -n 20
echo; echo "--- Application Support (top 20)"
sz "$HOME/Library/Application Support"/* 2>/dev/null | head -n 20
echo; echo "--- Caches (top 15)"
sz "$HOME/Library/Caches"/* 2>/dev/null | head -n 15

sec "PASTAS DE IA / MODELOS / DEV (candidatas a limpeza)"
sz "$HOME/.ollama" "$HOME/.cache/huggingface" "$HOME/.cache/torch" "$HOME/.lmstudio" \
   "$HOME/.cache/lm-studio" "$HOME/Library/Application Support/Claude" \
   "$HOME/Library/Application Support/Cursor" "$HOME/Library/Application Support/Code" \
   "$HOME/Library/Application Support/com.openai.chat" "$HOME/.claude" "$HOME/.cursor" \
   "$HOME/.codeium" "$HOME/.continue" "$HOME/.comfyui" "$HOME/ComfyUI" "$HOME/stable-diffusion-webui" \
   "$HOME/Library/Containers/com.docker.docker" "$HOME/.docker" "$HOME/.npm" "$HOME/.cache" \
   "$HOME/.pnpm-store" "$HOME/Library/pnpm" "$HOME/.yarn" "$HOME/.gradle" "$HOME/.cargo" \
   "$HOME/Library/Developer/Xcode/DerivedData" "$HOME/Library/Developer/CoreSimulator" \
   "$HOME/Library/Developer/Xcode/iOS DeviceSupport" "$HOME/Library/Developer/Xcode/Archives"
echo; echo "--- Modelos Ollama instalados:"; ollama list 2>/dev/null

sec "node_modules ANTIGOS (projetos parados há 90+ dias) — top 15"
find "$HOME" -maxdepth 5 -name node_modules -type d -prune -mtime +90 2>/dev/null \
  | while read -r d; do du -sh "$d" 2>/dev/null; done | sort -rh | head -n 15

sec "ARQUIVOS GRANDES (>1GB) em Downloads/Desktop/Documents/Movies"
find "$HOME/Downloads" "$HOME/Desktop" "$HOME/Documents" "$HOME/Movies" -type f -size +1G 2>/dev/null \
  -exec du -sh {} + 2>/dev/null | sort -rh | head -n 20

sec "LIXEIRA"
sz "$HOME/.Trash"

sec "HOMEBREW"
if command -v brew >/dev/null; then
  brew --version | head -n 1
  echo "Pacotes desatualizados:"; brew outdated 2>/dev/null | head -n 30
  echo "Cache do brew:"; sz "$(brew --cache)"
  echo "Serviços rodando:"; brew services list 2>/dev/null
fi

sec "APPS INSTALADOS (maiores)"
for a in /Applications/*.app "$HOME"/Applications/*.app; do du -sh "$a" 2>/dev/null; done | sort -rh | head -n 25

sec "SPOTLIGHT / BACKGROUND"
mdutil -s / 2>/dev/null
echo "mds/mdworker/photoanalysisd/bird alto na seção de CPU acima = indexação/fotos/iCloud sincronizando"

sec "NAVEGADORES — extensões e abas são vilãs comuns"
sz "$HOME/Library/Application Support/Google/Chrome" "$HOME/Library/Safari" \
   "$HOME/Library/Application Support/Firefox" "$HOME/Library/Application Support/Arc" 2>/dev/null

sec "ÓRFÃOS 1: inicializações apontando para programa que NÃO EXISTE mais"
for d in "$HOME/Library/LaunchAgents" /Library/LaunchAgents /Library/LaunchDaemons; do
  for p in "$d"/*.plist; do
    [ -e "$p" ] || continue
    case "$(basename "$p")" in com.apple.*) continue;; esac
    exe=$(/usr/libexec/PlistBuddy -c "Print :ProgramArguments:0" "$p" 2>/dev/null || \
          /usr/libexec/PlistBuddy -c "Print :Program" "$p" 2>/dev/null)
    if [ -n "$exe" ] && [ ! -e "$exe" ]; then echo "ÓRFÃO: $p  ->  $exe (não existe)"; fi
  done
done

sec "ÓRFÃOS 2: helpers privilegiados e itens de startup antigos"
ls -la /Library/PrivilegedHelperTools /Library/StartupItems /Library/Extensions 2>/dev/null
echo "--- cron do usuário:"; crontab -l 2>/dev/null
echo "--- Login/Logout hooks:"; defaults read com.apple.loginwindow 2>/dev/null | grep -iE "LoginHook|LogoutHook"

sec "ÓRFÃOS 3: preferências/containers de apps que não estão mais instalados"
for p in "$HOME"/Library/Preferences/*.plist; do
  id=$(basename "$p" .plist)
  case "$id" in com.apple.*|.GlobalPreferences*|loginwindow|*ByHost*) continue;; esac
  if [ -z "$(mdfind "kMDItemCFBundleIdentifier == '$id'" 2>/dev/null | head -n 1)" ]; then
    echo "$id   ($(du -sh "$p" 2>/dev/null | cut -f1))"
  fi
done | head -n 80
echo; echo "--- Containers/Group Containers/Saved State sem app correspondente:"
for d in "$HOME"/Library/Containers/* "$HOME"/Library/Saved\ Application\ State/*.savedState; do
  [ -e "$d" ] || continue
  id=$(basename "$d" .savedState)
  case "$id" in com.apple.*) continue;; esac
  [ -z "$(mdfind "kMDItemCFBundleIdentifier == '$id'" 2>/dev/null | head -n 1)" ] && echo "$d ($(du -sh "$d" 2>/dev/null | cut -f1))"
done | head -n 60

sec "ÓRFÃOS 4: pacotes instalados (pkgutil) de terceiros"
pkgutil --pkgs 2>/dev/null | grep -v '^com.apple' | head -n 80

sec "ÓRFÃOS 5: symlinks quebrados em bin e PATH com pastas inexistentes"
find /usr/local/bin /opt/homebrew/bin "$HOME/.local/bin" "$HOME/bin" -maxdepth 1 -type l ! -exec test -e {} \; -print 2>/dev/null
echo "--- Pastas do PATH que não existem:"
echo "$PATH" | tr ':' '\n' | while read -r d; do [ -d "$d" ] || echo "$d"; done
echo "--- Linhas de shell (.zshrc/.zprofile/.bash_profile) que carregam coisas:"
grep -nE "source |export PATH|eval |nvm|pyenv|rbenv|conda|sdkman" "$HOME"/.zshrc "$HOME"/.zprofile "$HOME"/.bash_profile "$HOME"/.bashrc 2>/dev/null
echo "--- Arquivos source/PATH que não existem mais:"
grep -hoE "source +[^ ]+" "$HOME"/.zshrc "$HOME"/.zprofile 2>/dev/null | awk '{print $2}' | tr -d '"' | while read -r f; do
  f="${f/#\~/$HOME}"; f="${f//\$HOME/$HOME}"; [ -e "$f" ] || echo "FALTA: $f"; done

sec "ÓRFÃOS 6: versões duplicadas de linguagens/ferramentas"
ls "$HOME/.nvm/versions/node" "$HOME/.pyenv/versions" "$HOME/.rbenv/versions" 2>/dev/null
ls /Library/Frameworks/Python.framework/Versions 2>/dev/null
command -v conda >/dev/null && conda env list
command -v docker >/dev/null && docker system df 2>/dev/null

sec "ÓRFÃOS 7: Application Support / Caches de apps não instalados (por nome)"
installed=$(ls /Applications "$HOME/Applications" 2>/dev/null | sed 's/\.app$//' | tr '[:upper:]' '[:lower:]')
for d in "$HOME"/Library/Application\ Support/*; do
  n=$(basename "$d" | tr '[:upper:]' '[:lower:]')
  case "$n" in com.apple.*|apple*|addressbook|crashreporter|icloud|mobilesync|knowledge|cloudkit|"cloudDocs"*) continue;; esac
  echo "$installed" | grep -qiF "$n" || echo "$(du -sh "$d" 2>/dev/null | cut -f1)	$d"
done | sort -rh | head -n 50
echo "(revisar manualmente: pode ser app instalado com nome diferente da pasta)"

sec "EXTRAS: Rosetta, Xcode CLT, atualizações pendentes, DNS/hosts alterados"
pkgutil --pkg-info=com.apple.pkg.RosettaUpdateAuto 2>/dev/null | head -n 2
xcode-select -p 2>/dev/null
softwareupdate -l 2>&1 | tail -n 8
grep -vE "^#|^$" /etc/hosts
scutil --dns 2>/dev/null | grep nameserver | sort -u

echo; echo "Relatório salvo em: $OUT"
