import pytest
from backend.services.debank import DeBankService
from backend.core.errors import InvalidAddressError

@pytest.mark.asyncio
async def test_invalid_address():
    """Test that invalid addresses raise proper error"""
    service = DeBankService(cache=None)

    with pytest.raises(InvalidAddressError):
        await service.get_wallet_positions("invalid")

    await service.close()

@pytest.mark.asyncio
async def test_invalid_address_too_short():
    """Test that short addresses raise proper error"""
    service = DeBankService(cache=None)

    with pytest.raises(InvalidAddressError):
        await service.get_wallet_positions("0x123")

    await service.close()

# Add more tests as needed
