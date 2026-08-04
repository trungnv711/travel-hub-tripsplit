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
    var sharedCount = shareWithMembers_(spreadsheet, data.trip.members);
    SpreadsheetApp.flush();
    var shareMessage = sharedCount ? ' Đã cấp quyền cho ' + sharedCount + ' email thành viên.' : ' Chưa có email thành viên; bạn vẫn có thể chia sẻ link Sheet thủ công.';
    return resultPage_('Hoàn tất', 'Google Sheet đã được cập nhật.' + shareMessage, spreadsheet.getUrl());
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
    if (member.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member.email)) throw new Error('Email không hợp lệ của thành viên: ' + member.name);
  });
  if (!Array.isArray(data.payments)) data.payments = [];
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
  if (sheet.getFilter()) sheet.getFilter().remove();
  sheet.getBandings().forEach(function(banding) { banding.remove(); });
  sheet.getDataRange().breakApart();
  sheet.clear();
  return sheet;
}

function writeOverview_(spreadsheet, data) {
  var trip = data.trip;
  var sheet = getSheet_(spreadsheet, 'Tổng quan');
  var totalExpense = trip.expenses.reduce(function(sum, item) { return sum + Number(item.amount || 0); }, 0);
  var rows = [
    ['TRIPSPLIT — BÁO CÁO QUYẾT TOÁN CHUYẾN ĐI', '', '', '', '', '', '', '', ''],
    ['Cập nhật lúc', new Date(data.generatedAt), '', '', '', '', '', '', ''],
    ['CHUYẾN ĐI', trip.name, 'ĐIỂM ĐẾN', trip.destination || 'Chưa cập nhật', 'THỜI GIAN', [trip.startDate || '?', trip.endDate || '?'].join(' – '), 'TRẠNG THÁI', trip.status || '', ''],
    ['', '', '', '', '', '', '', '', ''],
    ['TỔNG CHI PHÍ', totalExpense, 'THÀNH VIÊN', trip.members.length, 'CÒN GIAO DỊCH', data.settlements.length, 'ĐÃ THANH TOÁN', data.payments.length, ''],
    ['', '', '', '', '', '', '', '', ''],
    ['Thành viên', 'Email', 'Phải chịu', 'Đã ứng', 'Đã chuyển', 'Đã nhận', 'Còn phải trả', 'Còn được nhận', 'Trạng thái']
  ];
  data.summary.forEach(function(row) {
    var status = row.balance < 0 ? 'CÒN PHẢI TRẢ' : row.balance > 0 ? 'CÒN ĐƯỢC NHẬN' : (row.transferred || row.received) ? 'ĐÃ THANH TOÁN' : 'ĐÃ CÂN BẰNG';
    rows.push([row.name, row.email || '', row.owed, row.paid, row.transferred || 0, row.received || 0, row.balance < 0 ? Math.abs(row.balance) : 0, row.balance > 0 ? row.balance : 0, status]);
  });
  sheet.getRange(1, 1, rows.length, 9).setValues(rows);
  sheet.getRange('A1:I1').merge().setFontSize(18).setFontWeight('bold').setBackground('#1d4ed8').setFontColor('#ffffff').setHorizontalAlignment('center');
  sheet.getRange('A2:I2').setFontColor('#64748b').setFontStyle('italic');
  sheet.getRange('A3:I3').setBackground('#eff6ff').setFontWeight('bold');
  sheet.getRange('A5:H5').setBackground('#0f172a').setFontColor('#ffffff').setFontWeight('bold');
  sheet.getRange('B5').setNumberFormat('#,##0 [$₫-vi-VN]');
  styleSheet_(sheet, 7, 9);
  if (data.summary.length) {
    sheet.getRange(8, 3, data.summary.length, 6).setNumberFormat('#,##0 [$₫-vi-VN]');
    data.summary.forEach(function(row, index) {
      var target = sheet.getRange(8 + index, 1, 1, 9);
      if (row.balance < 0) target.setBackground('#fff1f2');
      else if (row.balance > 0) target.setBackground('#eff6ff');
      else if (row.transferred || row.received) target.setBackground('#f0fdf4');
    });
  }
  sheet.setTabColor('#2563eb');
}

function writeExpenses_(spreadsheet, data) {
  var sheet = getSheet_(spreadsheet, 'Chi phí');
  var memberNames = {};
  data.trip.members.forEach(function(member) { memberNames[member.id] = member.name; });
  var rows = [['STT', 'Nội dung', 'Ngày & giờ', 'Nhóm', 'Tổng tiền', 'Bình quân/người', 'Người ứng', 'Người tham gia', 'Phân bổ chi tiết', 'Ghi chú']];
  data.trip.expenses.forEach(function(item, index) {
    var allocation = Object.keys(item.shares || {}).map(function(memberId) { return (memberNames[memberId] || memberId) + ': ' + formatMoney_(item.shares[memberId]); }).join('\n');
    rows.push([index + 1, item.description, parseExpenseDate_(item.date), item.category || '', item.amount, item.averagePerPerson || 0, item.payerName, item.participantNames.join(', '), allocation, item.note || '']);
  });
  sheet.getRange(1, 1, rows.length, 10).setValues(rows);
  styleSheet_(sheet, 1, 10);
  if (rows.length > 1) {
    sheet.getRange(2, 3, rows.length - 1, 1).setNumberFormat('dd/MM/yyyy HH:mm');
    sheet.getRange(2, 5, rows.length - 1, 2).setNumberFormat('#,##0 [$₫-vi-VN]');
    sheet.getRange(1, 1, rows.length, 10).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false);
    sheet.getRange(1, 1, 1, 10).setBackground('#1d4ed8').setFontColor('#ffffff').setFontWeight('bold');
  }
  sheet.getRange(1, 1, rows.length, 10).createFilter();
  sheet.setColumnWidth(2, 220);
  sheet.setColumnWidth(8, 220);
  sheet.setColumnWidth(9, 240);
  sheet.setTabColor('#f59e0b');
}

function formatMoney_(value) {
  return Number(value || 0).toLocaleString('vi-VN') + ' ₫';
}

function parseExpenseDate_(value) {
  if (!value) return '';
  var text = String(value);
  var date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(text) ? text + 'T00:00:00' : text);
  return isNaN(date.getTime()) ? text : date;
}

function writeSettlements_(spreadsheet, data) {
  var sheet = getSheet_(spreadsheet, 'Chuyển tiền');
  var rows = [
    ['TRIPSPLIT — THEO DÕI CÔNG NỢ', '', '', '', ''],
    ['Cập nhật lúc', new Date(data.generatedAt), '', '', ''],
    ['', '', '', '', ''],
    ['CÔNG NỢ CHƯA THANH TOÁN', '', '', '', ''],
    ['Người cần trả', 'Người cần nhận', 'Số tiền', 'Trạng thái', 'Hướng dẫn']
  ];
  if (data.settlements.length) data.settlements.forEach(function(item) { rows.push([item.fromName, item.toName, item.amount, 'CHƯA THANH TOÁN', item.fromName + ' chuyển cho ' + item.toName]); });
  else rows.push(['', '', 0, 'ĐÃ THANH TOÁN HẾT', 'Không còn công nợ']);
  var paidTitleRow = rows.length + 2;
  rows.push(['', '', '', '', '']);
  rows.push(['LỊCH SỬ ĐÃ THANH TOÁN', '', '', '', '']);
  rows.push(['Người trả', 'Người nhận', 'Số tiền', 'Thời gian xác nhận', 'Trạng thái']);
  var paidStartRow = rows.length + 1;
  if (data.payments.length) data.payments.forEach(function(item) { rows.push([item.fromName, item.toName, item.amount, new Date(item.paidAt), 'ĐÃ THANH TOÁN']); });
  else rows.push(['', '', 0, '', 'Chưa có giao dịch']);
  sheet.getRange(1, 1, rows.length, 5).setValues(rows);
  sheet.getRange('A1:E1').merge().setFontSize(18).setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff').setHorizontalAlignment('center');
  sheet.getRange(4, 1, 1, 5).merge().setBackground('#ffedd5').setFontColor('#9a3412').setFontWeight('bold');
  sheet.getRange(5, 1, 1, 5).setBackground('#f97316').setFontColor('#ffffff').setFontWeight('bold');
  sheet.getRange(paidTitleRow, 1, 1, 5).merge().setBackground('#dcfce7').setFontColor('#166534').setFontWeight('bold');
  sheet.getRange(paidTitleRow + 1, 1, 1, 5).setBackground('#16a34a').setFontColor('#ffffff').setFontWeight('bold');
  if (data.settlements.length) sheet.getRange(6, 1, data.settlements.length, 5).setBackground('#fff7ed');
  if (data.payments.length) sheet.getRange(paidStartRow, 1, data.payments.length, 5).setBackground('#f0fdf4');
  sheet.getRange(6, 3, Math.max(data.settlements.length, 1), 1).setNumberFormat('#,##0 [$₫-vi-VN]');
  sheet.getRange(paidStartRow, 3, Math.max(data.payments.length, 1), 1).setNumberFormat('#,##0 [$₫-vi-VN]');
  if (data.payments.length) sheet.getRange(paidStartRow, 4, data.payments.length, 1).setNumberFormat('dd/MM/yyyy HH:mm');
  sheet.setFrozenRows(5);
  sheet.getDataRange().setVerticalAlignment('middle').setWrap(true);
  sheet.autoResizeColumns(1, 5);
  sheet.setColumnWidth(5, 260);
  sheet.setTabColor('#16a34a');
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
  var emails = members.map(function(member) { return String(member.email || '').trim().toLowerCase(); }).filter(function(email, index, all) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && all.indexOf(email) === index;
  });
  if (emails.length) spreadsheet.addEditors(emails);
  return emails.length;
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
