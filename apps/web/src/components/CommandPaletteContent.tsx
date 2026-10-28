/**
 * 命令面板共享外壳,对齐 t3code CommandPaletteContent:
 * 单一输入框 + 结果面板 + 底部键盘提示条;具体条目/过滤由各模式提供。
 *
 * 注意:命令面板本体已重构到 components/command-palette/;
 * 这个外壳现在只服务于 ⌘P 文件选择器（components/files/ProjectFilePicker）。
 */
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { useI18n } from "~/i18n";
import { Command, CommandFooter, CommandInput, CommandPanel } from "./ui/command";
import { Kbd, KbdGroup } from "./ui/kbd";

type CommandPaletteContentProps = Omit<ComponentProps<typeof Command>, "children"> & {
  readonly children: ReactNode;
  readonly escapeLabel?: ReactNode;
  readonly footerActionLabel?: ReactNode;
  readonly footerTrailing?: ReactNode;
  readonly inputAccessory?: ReactNode;
  readonly inputProps: ComponentProps<typeof CommandInput>;
  readonly panelClassName?: string;
  readonly showBackHint?: boolean;
  readonly testId?: string;
};

export function CommandPaletteContent({
  children,
  escapeLabel,
  footerActionLabel,
  footerTrailing,
  inputAccessory,
  inputProps,
  panelClassName,
  showBackHint,
  testId,
  ...commandProps
}: CommandPaletteContentProps) {
  const { tr } = useI18n();
  return (
    <div className="contents" data-testid={testId}>
      <Command {...commandProps}>
        <div className="relative">
          <CommandInput {...inputProps} />
          {inputAccessory}
        </div>
        <CommandPanel className={panelClassName}>{children}</CommandPanel>
        <CommandFooter className="gap-3 max-sm:flex-col max-sm:items-start">
          <div className="flex items-center gap-3">
            <KbdGroup className="items-center gap-1.5">
              <Kbd>
                <ArrowUpIcon />
              </Kbd>
              <Kbd>
                <ArrowDownIcon />
              </Kbd>
              <span>{tr("导航", "Navigate")}</span>
            </KbdGroup>
            {footerActionLabel !== undefined ? (
              <KbdGroup className="items-center gap-1.5">
                <Kbd>Enter</Kbd>
                <span>{footerActionLabel}</span>
              </KbdGroup>
            ) : null}
            {showBackHint ? (
              <KbdGroup className="items-center gap-1.5">
                <Kbd>Backspace</Kbd>
                <span>{tr("返回", "Back")}</span>
              </KbdGroup>
            ) : null}
            <KbdGroup className="items-center gap-1.5">
              <Kbd>Esc</Kbd>
              <span>{escapeLabel ?? tr("关闭", "Close")}</span>
            </KbdGroup>
          </div>
          {footerTrailing}
        </CommandFooter>
      </Command>
    </div>
  );
}
