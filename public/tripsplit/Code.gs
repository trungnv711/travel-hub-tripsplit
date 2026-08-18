/** TripSplit Google Apps Script bridge.
 * Deploy as Web app: Execute as "Me"; access "Anyone" (or your Workspace domain).
 */
function doGet(e) {
  if (e && e.parameter && e.parameter.health === '1') {
    return jsonResult_({ ok: true, service: 'TripSplit Sheet Bridge', version: 4 });
  }
  return HtmlService.createHtmlOutput('<h2>TripSplit Sheet Bridge đang hoạt động</h2><p>Quay lại TripSplit và dùng nút tạo/cập nhật Sheet.</p>');
}

function doPost(e) {
  var data = {};
  var lock = LockService.getScriptLock();
  var locked = false;
  try {
    data = JSON.parse((e && e.parameter && e.parameter.payload) || '{}');
    validateSecret_(data.secret);
    validatePayload_(data);
    locked = lock.tryLock(30000);
    if (!locked) throw new Error('Một yêu cầu khác đang cập nhật Sheet. Vui lòng thử lại sau ít phút.');
    var spreadsheet = getOrCreateSpreadsheet_(data.trip);
    writeOverview_(spreadsheet, data);
    writeAdvances_(spreadsheet, data);
    writeExpenses_(spreadsheet, data);
    writeSettlements_(spreadsheet, data);
    var shareResult = shareWithMembers_(spreadsheet, data.trip.members);
    SpreadsheetApp.flush();
    return response_(data, {
      ok: true,
      message: shareResult.sharedCount
        ? 'Google Sheet đã được cập nhật và cấp quyền cho ' + shareResult.sharedCount + ' email thành viên.'
        : 'Google Sheet đã được cập nhật. Chưa có email hợp lệ để cấp quyền tự động.',
      sheetUrl: spreadsheet.getUrl(),
      sharedCount: shareResult.sharedCount,
      failedEmails: shareResult.failedEmails
    });
  } catch (error) {
    return response_(data, { ok: false, error: error.message || String(error) });
  } finally {
    if (locked && lock.hasLock()) lock.releaseLock();
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
  if (!Array.isArray(data.trip.fundTransactions)) data.trip.fundTransactions = [];
  if (!data.fund) data.fund = { totalDeposited: 0, totalRefunded: 0, fundSpent: 0, fundBalance: 0 };
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
  var totalExpense = trip.expenses.reduce(function(sum, item) { return item.included === false ? sum : sum + Number(item.amount || 0); }, 0);
  var totalPrepaid = Number(data.fund.totalDeposited || 0);
  var rows = [
    ['TRIPSPLIT — BÁO CÁO QUYẾT TOÁN CHUYẾN ĐI', '', '', '', '', '', '', '', '', '', '', ''],
    ['Cập nhật lúc', new Date(data.generatedAt), '', '', '', '', '', '', '', '', '', ''],
    ['CHUYẾN ĐI', trip.name, 'ĐIỂM ĐẾN', trip.destination || 'Chưa cập nhật', 'THỜI GIAN', [trip.startDate || '?', trip.endDate || '?'].join(' – '), 'TRẠNG THÁI', trip.status || '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', ''],
    ['TỔNG CHI PHÍ', totalExpense, 'TỔNG ĐÃ NẠP', totalPrepaid, 'CHI TỪ QUỸ', Number(data.fund.fundSpent || 0), 'QUỸ CÒN LẠI', Number(data.fund.fundBalance || 0), 'NGƯỜI GIỮ QUỸ', trip.fundKeeperName || '', 'CÒN GIAO DỊCH', data.settlements.length],
    ['', '', '', '', '', '', '', '', '', '', '', ''],
    ['Thành viên', 'Email', 'Phải chịu', 'Tổng tạm ứng', 'Đã hoàn', 'Còn lại tạm ứng', 'Đã ứng cá nhân', 'Đã chuyển', 'Đã nhận', 'Quyết toán', 'Trạng thái', 'Ghi chú quỹ']
  ];
  data.summary.forEach(function(row) {
    var status = row.balance < 0 ? 'CÒN PHẢI TRẢ' : row.balance > 0 ? 'CÒN ĐƯỢC NHẬN' : (row.transferred || row.received) ? 'ĐÃ THANH TOÁN' : 'ĐÃ CÂN BẰNG';
    rows.push([row.name, row.email || '', row.owed, row.prepaid || 0, row.refunded || 0, row.remainingAdvance || 0, row.paid, row.transferred || 0, row.received || 0, row.balance, status, row.fundHeld ? 'Đang giữ quỹ: ' + formatMoney_(Math.abs(row.fundHeld)) : '']);
  });
  sheet.getRange(1, 1, rows.length, 12).setValues(rows);
  sheet.getRange('A1:L1').merge().setFontSize(18).setFontWeight('bold').setBackground('#1d4ed8').setFontColor('#ffffff').setHorizontalAlignment('center');
  sheet.getRange('A2:L2').setFontColor('#64748b').setFontStyle('italic');
  sheet.getRange('A3:L3').setBackground('#eff6ff').setFontWeight('bold');
  sheet.getRange('A5:L5').setBackground('#0f172a').setFontColor('#ffffff').setFontWeight('bold');
  sheet.getRange('B5').setNumberFormat('#,##0 [$₫-vi-VN]');
  sheet.getRange('D5').setNumberFormat('#,##0 [$₫-vi-VN]');
  sheet.getRange('F5').setNumberFormat('#,##0 [$₫-vi-VN]');
  sheet.getRange('H5').setNumberFormat('#,##0 [$₫-vi-VN]');
  styleSheet_(sheet, 7, 12);
  if (data.summary.length) {
    sheet.getRange(8, 3, data.summary.length, 8).setNumberFormat('#,##0 [$₫-vi-VN]');
    data.summary.forEach(function(row, index) {
      var target = sheet.getRange(8 + index, 1, 1, 12);
      if (row.balance < 0) target.setBackground('#fff1f2');
      else if (row.balance > 0) target.setBackground('#eff6ff');
      else if (row.transferred || row.received) target.setBackground('#f0fdf4');
    });
  }
  sheet.setTabColor('#2563eb');
}

function writeAdvances_(spreadsheet, data) {
  var sheet = getSheet_(spreadsheet, 'Tạm ứng');
  var rows = [['TRIPSPLIT — SỔ QUỸ CHUYẾN ĐI', '', '', '', '', ''], ['Người giữ quỹ', data.trip.fundKeeperName || '', 'Tổng đã nạp', Number(data.fund.totalDeposited || 0), 'Quỹ còn lại', Number(data.fund.fundBalance || 0)], ['', '', '', '', '', ''], ['STT', 'Thành viên', 'Tạm ứng ban đầu', 'Nạp thêm', 'Đã hoàn', 'Còn lại tạm ứng']];
  data.trip.members.forEach(function(member, index) {
    var summary = data.summary.filter(function(item) { return item.memberId === member.id; })[0] || {};
    rows.push([index + 1, member.name, Number(member.prepaidAmount || 0), Math.max(0, Number(summary.prepaid || 0) - Number(member.prepaidAmount || 0)), Number(summary.refunded || 0), Number(summary.remainingAdvance || 0)]);
  });
  var ledgerHeaderRow = rows.length + 2;
  rows.push(['', '', '', '', '', '']);
  rows.push(['THỜI GIAN', 'THÀNH VIÊN', 'LOẠI', 'SỐ TIỀN', 'GHI CHÚ', '']);
  data.trip.fundTransactions.forEach(function(item) { rows.push([new Date(item.occurredAt), item.memberName || '', item.type === 'refund' ? 'HOÀN TIỀN' : 'NẠP THÊM', Number(item.amount || 0), item.note || '', '']); });
  sheet.getRange(1, 1, rows.length, 6).setValues(rows);
  sheet.getRange('A1:F1').merge().setFontSize(16).setFontWeight('bold').setBackground('#7c3aed').setFontColor('#ffffff').setHorizontalAlignment('center');
  sheet.getRange(2, 3, 1, 4).setNumberFormat('#,##0 [$₫-vi-VN]');
  sheet.getRange(4, 1, 1, 6).setBackground('#ede9fe').setFontWeight('bold');
  sheet.getRange(5, 3, Math.max(1, data.trip.members.length), 4).setNumberFormat('#,##0 [$₫-vi-VN]');
  sheet.getRange(ledgerHeaderRow, 1, 1, 6).setBackground('#1d4ed8').setFontColor('#ffffff').setFontWeight('bold');
  if (data.trip.fundTransactions.length) {
    sheet.getRange(ledgerHeaderRow + 1, 1, data.trip.fundTransactions.length, 1).setNumberFormat('dd/MM/yyyy HH:mm');
    sheet.getRange(ledgerHeaderRow + 1, 4, data.trip.fundTransactions.length, 1).setNumberFormat('#,##0 [$₫-vi-VN]');
  }
  sheet.setColumnWidth(2, 180);
  sheet.setColumnWidth(3, 160);
  sheet.setColumnWidth(5, 280);
  sheet.setFrozenRows(4);
  sheet.setTabColor('#7c3aed');
}

function writeExpenses_(spreadsheet, data) {
  var sheet = getSheet_(spreadsheet, 'Chi phí');
  var memberNames = {};
  data.trip.members.forEach(function(member) { memberNames[member.id] = member.name; });
  var rows = [['STT', 'Quyết toán', 'Nội dung', 'Ngày & giờ', 'Nhóm', 'Nguồn tiền', 'Tổng tiền', 'Tổng tiền/người', 'Người trả/giữ quỹ', 'Người tham gia', 'Phân bổ chi tiết', 'Ghi chú']];
  data.trip.expenses.forEach(function(item, index) {
    var allocation = Object.keys(item.shares || {}).map(function(memberId) { return (memberNames[memberId] || memberId) + ': ' + formatMoney_(item.shares[memberId]); }).join('\n');
    rows.push([index + 1, item.included === false ? 'KẾ HOẠCH - CHƯA TÍNH' : 'ĐANG TÍNH', item.description, parseExpenseDate_(item.date), item.category || '', item.paymentSourceLabel || 'Cá nhân tự trả', item.amount, item.averagePerPerson || 0, item.payerName, item.participantNames.join(', '), allocation, item.note || '']);
  });
  sheet.getRange(1, 1, rows.length, 12).setValues(rows);
  styleSheet_(sheet, 1, 12);
  if (rows.length > 1) {
    sheet.getRange(2, 4, rows.length - 1, 1).setNumberFormat('dd/MM/yyyy HH:mm');
    sheet.getRange(2, 7, rows.length - 1, 2).setNumberFormat('#,##0 [$₫-vi-VN]');
    sheet.getRange(1, 1, rows.length, 12).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false);
    sheet.getRange(1, 1, 1, 12).setBackground('#1d4ed8').setFontColor('#ffffff').setFontWeight('bold');
    data.trip.expenses.forEach(function(item, index) { if (item.included === false) sheet.getRange(index + 2, 1, 1, 12).setBackground('#f1f5f9').setFontColor('#64748b'); });
  }
  sheet.getRange(1, 1, rows.length, 12).createFilter();
  sheet.setColumnWidth(2, 150);
  sheet.setColumnWidth(3, 220);
  sheet.setColumnWidth(9, 220);
  sheet.setColumnWidth(10, 240);
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
  }).slice(0, 50);
  var sharedCount = 0;
  var failedEmails = [];
  emails.forEach(function(email) {
    try {
      spreadsheet.addEditor(email);
      sharedCount += 1;
    } catch (error) {
      failedEmails.push(email);
    }
  });
  return { sharedCount: sharedCount, failedEmails: failedEmails };
}

function response_(requestData, result) {
  if (requestData && requestData.responseMode === 'json') return jsonResult_(result);
  if (result.ok) return resultPage_('Hoàn tất', result.message, result.sheetUrl || '');
  return resultPage_('Không thể tạo Sheet', result.error || 'Lỗi không xác định.', '');
}

function jsonResult_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
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
