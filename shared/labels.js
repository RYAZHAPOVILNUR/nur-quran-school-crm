// Русские подписи для справочников. Общие для сервера и браузера.
export const ROLES = { owner: 'Владелец', admin: 'Администратор', teacher: 'Учитель', parent: 'Родитель' };

export const STUDENT_STATUS = {
  active: 'Учится',
  waiting: 'Ждёт места',
  paused: 'На паузе',
  finished: 'Закончил',
  left: 'Ушёл',
};

export const DIRECTIONS = {
  reading: 'Чтение с нуля',
  tajweed: 'Таджвид',
  hifz: 'Хифз',
  individual: 'Индивидуально',
};

export const FORMATS = { offline: 'Очно', online: 'Онлайн' };

export const GROUP_GENDER = { m: 'Мальчики и мужчины', f: 'Девочки и женщины' };

export const SOURCES = {
  friends: 'Знакомые',
  instagram: 'Instagram',
  mosque: 'Мечеть',
  site: 'Сайт',
  other: 'Другое',
};

export const ATTENDANCE = {
  present: 'Был',
  late: 'Опоздал',
  excused: 'Уважит.',
  absent: 'Не был',
};

export const GRADES = {
  excellent: 'Сдал отлично',
  errors: 'Сдал с ошибками',
  fail: 'Не сдал — повторить',
};

export const LEAD_STATUS = {
  new: 'Новая',
  contacted: 'Связались',
  trial_scheduled: 'Записан на пробный',
  trial_done: 'Был на пробном',
  enrolled: 'Стал учеником',
  rejected: 'Отказ',
};

export const LEAD_FLOW = ['new', 'contacted', 'trial_scheduled', 'trial_done', 'enrolled'];

export const METHODS = { cash: 'Наличные', transfer: 'Перевод' };

export const WEEKDAYS = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
export const WEEKDAYS_FULL = ['', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

export const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
export const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const MONTHS_PREP = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];

export function monthLabel(month) {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function rub(n) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(n || 0)) + ' ₽';
}

export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
