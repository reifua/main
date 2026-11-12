// The UI texts of the form engine, collected in one place so the copy can be
// edited (or translated) without touching the logic. The engine ships
// Ukrainian; the strings that still live in other modules stay there until
// they are moved here deliberately.

/**
 * The notices the file field puts under a photo that broke a limit.
 *
 * - `size` - the file is over the byte limit (maxSize) only,
 * - `dims` - the file is over the resize box (resizeWidth/resizeHeight) only,
 * - `both` - the file is over both.
 *
 * `{limit}` stands for the maxSize display ("150 KB"), `{size}` for the
 * resize box ("800×600").
 */
export const FILE_LIMIT_TEXTS = {
  size: 'Доданий фотознімок перевищує встановлений ліміт {limit}. Система автоматично стисне файл до {limit} і файл буде у межах ліміту.',
  dims: 'Доданий фотознімок перевищує встановлений ліміт {size}. Система автоматично змінить розміри фотознімку до {size}.',
  both: 'Доданий фотознімок перевищує встановлені ліміти, а саме розмір зображення {size} і кількість кілобайт у файлі {limit}. Система автоматично змінить розміри фотознімків до {size} та стисне файли до {limit} встановлених меж ліміту.',
};

/**
 * Fills the placeholders of a file-limit notice.
 *
 * @param {string} kind - one of the FILE_LIMIT_TEXTS keys.
 * @param {{limit?: string, size?: string}} [values] - the placeholder values.
 * @returns {string|null} the notice, or null for an unknown kind.
 */
export function fileLimitText(kind, values) {
  const tpl = FILE_LIMIT_TEXTS[kind];
  if (!tpl) return null;
  const limit = values && values.limit !== undefined ? String(values.limit) : '';
  const size = values && values.size !== undefined ? String(values.size) : '';
  return tpl.replace(/\{limit\}/g, limit).replace(/\{size\}/g, size);
}
