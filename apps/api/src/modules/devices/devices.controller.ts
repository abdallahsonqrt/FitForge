import { Controller, Get, Post, Delete, Body, Param, ParseUUIDPipe } from '@nestjs/common';
import { DevicesService } from './devices.service';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

/** The authenticated caller, as `JwtStrategy` builds it. `sid` names their session row. */
type Caller = { id: string; sid?: string };

@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get()
  async getDevices(@CurrentUser() user: Caller) {
    return this.devicesService.getDevices(user.id);
  }

  @Post()
  async registerDevice(@CurrentUser() user: Caller, @Body() body: RegisterDeviceDto) {
    // `sid` is the device the caller is signed in on, so a push token registered
    // without an explicit `deviceId` lands on that row instead of creating a
    // second one for the same phone.
    return this.devicesService.registerDevice(user.id, body, user.sid);
  }

  @Delete(':id')
  async removeDevice(
    @CurrentUser() user: Caller,
    // `id` goes straight into a `uuid` comparison; without this a malformed one
    // raises a driver error and returns 500 instead of 400.
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.devicesService.removeDevice(user.id, id);
  }
}
