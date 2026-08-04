/** TripSplit Google Apps Script bridge.
 * Deploy as Web app: Execute as "Me"; access "Anyone" (or your Workspace domain).
 */
function doGet() {
  return HtmlService.createHtmlOutput('<h2>TripSplit Sheet Bridge đang hoạt động</h2><p>Quay lại TripSplit và dùng nút tạo/cập nhật Sheet.</p>');
}

function doPost(e) {
  try {
    var data = JSON.parse(e.parameter.payload || '{}');
    validateSecret_(data.secret);
    validatePayload_(data);
    var spreadsheet = getOrCreateSpreadsheet_(data.trip);
    writeOverview_(spreadsheet, data);
    writeExpenses_(spreadsheet, data);
    writeSettlements_(spreadsheet, data);
    shareWithMembers_(spreadsheet, data.trip.members);
    SpreadsheetApp.flush();
    return resultPage_('Hoàn tất', 'Google Sheet đã được cập nhật và chia sẻ với tất cả thành viên.', spreadsheet.getUrl());
  } catch (error) {
    return resultPage_('Không thể tạo Sheet', error.message || String(error), '');
  }
}

function validateSecret_(provided) {
  var expected = PropertiesService.getScriptProperties().getProperty('TRIPSPLIT_SECRET');
  if (!expected) throw new Error('Quản trị viên chưa cấu hình TRIPSPLIT_SECRET trong Script Properties.');
  if (!provided || provided !== expected) throw new Error('Mã bí mật không đúng.');
}

function validatePayload_(data) {
  if (!data.trip || !data.trip.id || !data.trip.name) throw new Error('Thiếu thông tin chuyến đi.');
  if (!Array.isArray(data.trip.members) || !Array.isArray(data.trip.expenses)) throw new Error('Danh sách thành viên hoặc chi phí không hợp lệ.');
  data.trip.members.forEach(function(member) {
    if (!member.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member.email)) throw new Error('Email không hợp lệ của thành viên: ' + member.name);
  });
}

function getOrCreateSpreadsheet_(trip) {
  var properties = PropertiesService.getScriptProperties();
  var key = 'trip_' + trip.id;
  var spreadsheetId = properties.getProperty(key);
  if (spreadsheetId) {
    try { return SpreadsheetApp.openById(spreadsheetId); } catch (error) { properties.deleteProperty(key); }
  }
  var spreadsheet = SpreadsheetApp.create('TripSplit — ' + trip.name);
  properties.setProperty(key, spreadsheet.getId());
  return spreadsheet;
}

function getSheet_(spreadsheet, name) {
  var sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  sheet.clear();
  return sheet;
}

function writeOverview_(spreadsheet, data) {
  var trip = data.trip;
  var sheet = getSheet_(spreadsheet, 'Tổng quan');
  var rows = [
    ['TRIPSPLIT — TỔNG QUAN CHUYẾN ĐI', '', '', '', ''],
    ['Tên chuyến đi', trip.name, '', '', ''],
    ['Điểm đến', trip.destination || '', '', '', ''],
    ['Thời gian', [trip.startDate || '?', trip.endDate || '?'].join(' – '), '', '', ''],
    ['Trạng thái', trip.status || '', '', '', ''],
    ['Cập nhật lúc', new Date(data.generatedAt), '', '', ''],
    ['', '', '', '', ''],
    ['Thành viên', 'Email', 'Phải chịu', 'Đã trả', 'Số dư']
  ];
  data.summary.forEach(function(row) { rows.push([row.name, row.email, row.owed, row.paid, row.balance]); });
  sheet.getRange(1, 1, rows.length, 5).setValues(rows);
  styleSheet_(sheet, 8, 5);
  sheet.getRange(9, 3, Math.max(data.summary.length, 1), 3).setNumberFormat('#,##0 [$₫-vi-VN]');
  sheet.getRange('A1:E1').merge().setFontSize(16).setFontWeight('bold').setBackground('#2563eb').setFontColor('#ffffff');
}

function writeExpenses_(spreadsheet, data) {
  var sheet = getSheet_(spreadsheet, 'Chi phí');
  var rows = [['Nội dung', 'Ngày & giờ', 'Nhóm', 'Tổng tiền', 'Người trả', 'Người tham gia', 'Cách chia', 'Ghi chú']];
  data.trip.expenses.forEach(function(item) {
    rows.push([item.description, parseExpenseDate_(item.date), item.category || '', item.amount, item.payerName, item.participantNames.join(', '), item.splitMode === 'custom' ? 'Tùy chỉnh' : 'Chia đều', item.note || '']);
  });
  sheet.getRange(1, 1, rows.length, 8).setValues(rows);
  styleSheet_(sheet, 1, 8);
  if (rows.length > 1) {
    sheet.getRange(2, 2, rows.length - 1, 1).setNumberFormat('dd/MM/yyyy HH:mm');
    sheet.getRange(2, 4, rows.length - 1, 1).setNumberFormat('#,##0 [$₫-vi-VN]');
  }
  sheet.getRange(1, 1, 1, 8).createFilter();
}

function parseExpenseDate_(value) {
  if (!value) return '';
  var text = String(value);
  var date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(text) ? text + 'T00:00:00' : text);
  return isNaN(date.getTime()) ? text : date;
}

function writeSettlements_(spreadsheet, data) {
  var sheet = getSheet_(spreadsheet, 'Chuyển tiền');
  var rows = [['Người gửi', 'Người nhận', 'Số tiền', 'Trạng thái']];
  data.settlements.forEach(function(item) { rows.push([item.fromName, item.toName, item.amount, 'Chưa xác nhận']); });
  sheet.getRange(1, 1, rows.length, 4).setValues(rows);
  styleSheet_(sheet, 1, 4);
  if (rows.length > 1) sheet.getRange(2, 3, rows.length - 1, 1).setNumberFormat('#,##0 [$₫-vi-VN]');
}

function styleSheet_(sheet, frozenRows, columns) {
  sheet.setFrozenRows(frozenRows);
  sheet.getRange(frozenRows, 1, 1, columns).setFontWeight('bold').setBackground('#eff6ff').setFontColor('#1d4ed8');
  sheet.getDataRange().setVerticalAlignment('middle').setWrap(true);
  sheet.autoResizeColumns(1, columns);
  for (var column = 1; column <= columns; column += 1) {
    if (sheet.getColumnWidth(column) > 320) sheet.setColumnWidth(column, 320);
  }
}

function shareWithMembers_(spreadsheet, members) {
  var emails = members.map(function(member) { return member.email.trim().toLowerCase(); });
  spreadsheet.addEditors(emails);
}

function resultPage_(title, message, url) {
  var safeTitle = escapeHtml_(title);
  var safeMessage = escapeHtml_(message);
  var link = url ? '<a href="' + escapeHtml_(url) + '" target="_blank">Mở Google Sheet</a>' : '';
  return HtmlService.createHtmlOutput('<meta name="viewport" content="width=device-width"><style>body{font-family:Arial,sans-serif;max-width:640px;margin:60px auto;padding:24px;color:#172033}h1{font-size:24px}p{line-height:1.6}a{display:inline-block;padding:12px 18px;background:#188038;color:white;text-decoration:none;border-radius:8px;font-weight:bold}</style><h1>' + safeTitle + '</h1><p>' + safeMessage + '</p>' + link);
}

function escapeHtml_(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
